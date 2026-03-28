/**
 * CNBT Inventory - Main Application
 *
 * Orchestrates grids, NUI communication, context menu,
 * hotbar, sort, split dialog, and tooltips.
 */

'use strict';

window.CNBT = (function () {
    // ============================================
    // STATE
    // ============================================
    let itemDefs = {};
    let backpackConfigs = {};
    let hotbarSlotCount = 5;

    // Grids
    let playerGrid = null;
    let backpackGrid = null;
    let externalGrid = null;

    // Grid metadata (owner/invType mapping)
    const gridMeta = {};

    // Hotbar assignments: slot -> { itemName, gridId, x, y }
    let hotbar = [];

    // External inventory info
    let externalInfo = null;

    // Backpack info
    let equippedBackpack = null;

    // Context menu state
    let contextTarget = null;

    // ============================================
    // NUI COMMUNICATION
    // ============================================

    function nuiCallback(name, data) {
        fetch(`https://cnbt-inventory/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        }).catch(() => {});
    }

    // Listen for NUI messages from client Lua
    window.addEventListener('message', function (event) {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'open':
                handleOpen(msg);
                break;
            case 'close':
                handleClose();
                break;
            case 'moveSuccess':
                // Already optimistically updated
                break;
            case 'moveFailed':
                handleMoveFailed();
                break;
            case 'transferSuccess':
                // Already optimistically updated
                break;
            case 'stackSuccess':
                // Already optimistically updated
                break;
            case 'splitSuccess':
                handleSplitSuccess(msg.data);
                break;
            case 'useSuccess':
                handleUseSuccess(msg.data);
                break;
            case 'backpackEquipped':
                handleBackpackEquipped(msg.backpack);
                break;
            case 'backpackUnequipped':
                handleBackpackUnequipped();
                break;
            case 'sortComplete':
                handleSortComplete(msg.data);
                break;
            case 'useHotbar':
                useHotbarSlot(msg.slot);
                break;
        }
    });

    // ============================================
    // OPEN / CLOSE
    // ============================================

    function handleOpen(msg) {
        itemDefs = msg.itemDefs || {};
        backpackConfigs = msg.backpackConfigs || {};
        hotbarSlotCount = msg.hotbarSlots || 5;

        const container = document.getElementById('inventory-container');
        container.classList.remove('hidden');

        // Setup player grid
        const playerEl = document.getElementById('player-grid');
        const pd = msg.playerData;

        if (playerGrid) playerGrid.destroy();
        playerGrid = new InventoryGrid(playerEl, pd.cols, pd.rows, pd.maxWeight, 'player');
        playerGrid.loadItems(pd.items || []);
        gridMeta['player'] = { owner: null, invType: 'player' }; // null owner = current player

        // Hotbar
        hotbar = pd.hotbar || [];
        buildHotbar();
        renderHotbar();

        // Backpack
        equippedBackpack = pd.backpack || null;
        if (equippedBackpack) {
            showBackpackGrid(equippedBackpack);
        } else {
            hideBackpackGrid();
        }
        renderBackpackSlot();

        // External inventory
        if (msg.externalInv) {
            showExternalInventory(msg.externalInv);
        } else {
            hideExternalInventory();
        }

        updateWeightDisplays();

        // Close context menu if open
        hideContextMenu();
        hideSplitDialog();
    }

    function handleClose() {
        const container = document.getElementById('inventory-container');
        container.classList.add('hidden');

        if (playerGrid) { playerGrid.destroy(); playerGrid = null; }
        if (backpackGrid) { backpackGrid.destroy(); backpackGrid = null; }
        if (externalGrid) { externalGrid.destroy(); externalGrid = null; }

        hideContextMenu();
        hideSplitDialog();
        hideTooltip();
    }

    // ============================================
    // EXTERNAL INVENTORY
    // ============================================

    function showExternalInventory(extData) {
        const panel = document.getElementById('external-panel');
        panel.classList.remove('hidden');

        document.getElementById('external-label').textContent = extData.label || 'Storage';

        const extEl = document.getElementById('external-grid');
        if (externalGrid) externalGrid.destroy();
        externalGrid = new InventoryGrid(extEl, extData.cols, extData.rows, extData.maxWeight, 'external');
        externalGrid.loadItems(extData.items || []);

        externalInfo = extData;
        gridMeta['external'] = { owner: extData.owner, invType: extData.invType };
    }

    function hideExternalInventory() {
        const panel = document.getElementById('external-panel');
        panel.classList.add('hidden');
        if (externalGrid) { externalGrid.destroy(); externalGrid = null; }
        externalInfo = null;
        delete gridMeta['external'];
    }

    // ============================================
    // BACKPACK
    // ============================================

    function showBackpackGrid(bp) {
        const bpConfig = backpackConfigs[bp.name];
        if (!bpConfig) return;

        const gridContainer = document.getElementById('backpack-grid-container');
        gridContainer.classList.remove('hidden');

        const def = itemDefs[bp.name];
        document.getElementById('backpack-label').textContent = def ? def.label : 'Backpack';

        const bpEl = document.getElementById('backpack-grid');
        if (backpackGrid) backpackGrid.destroy();
        backpackGrid = new InventoryGrid(bpEl, bpConfig.cols, bpConfig.rows, bpConfig.maxWeight, 'backpack');
        backpackGrid.loadItems(bp.items || []);

        gridMeta['backpack'] = { owner: null, invType: 'player' };
    }

    function hideBackpackGrid() {
        const gridContainer = document.getElementById('backpack-grid-container');
        gridContainer.classList.add('hidden');
        if (backpackGrid) { backpackGrid.destroy(); backpackGrid = null; }
        delete gridMeta['backpack'];
    }

    function renderBackpackSlot() {
        const slot = document.getElementById('backpack-slot');
        slot.innerHTML = '';

        if (equippedBackpack) {
            const def = itemDefs[equippedBackpack.name];
            const equipped = document.createElement('div');
            equipped.className = 'backpack-equipped-item';

            const img = new Image();
            img.src = def ? `img/${def.image}` : '';
            img.onerror = function () {
                this.style.display = 'none';
                const ph = document.createElement('div');
                ph.className = 'item-image-placeholder';
                ph.textContent = def ? def.label : equippedBackpack.name;
                equipped.appendChild(ph);
            };
            equipped.appendChild(img);

            const label = document.createElement('span');
            label.className = 'bp-label';
            label.textContent = def ? def.label : equippedBackpack.name;
            equipped.appendChild(label);

            // Right click to unequip
            equipped.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY, [
                    {
                        label: 'Unequip Backpack',
                        action: function () {
                            nuiCallback('unequipBackpack', {});
                        },
                    },
                ]);
            });

            slot.appendChild(equipped);
        } else {
            const empty = document.createElement('span');
            empty.className = 'empty-text';
            empty.textContent = 'Drag backpack here';
            slot.appendChild(empty);
        }
    }

    function handleBackpackEquipped(bp) {
        equippedBackpack = bp;
        showBackpackGrid(bp);
        renderBackpackSlot();
        // Refresh player grid (item was removed)
        if (playerGrid) {
            playerGrid._renderAllItems();
            playerGrid.rebuildOccupied();
        }
        updateWeightDisplays();
    }

    function handleBackpackUnequipped() {
        equippedBackpack = null;
        hideBackpackGrid();
        renderBackpackSlot();
        updateWeightDisplays();
    }

    // ============================================
    // HOTBAR
    // ============================================

    function buildHotbar() {
        const hotbarEl = document.getElementById('hotbar');
        hotbarEl.innerHTML = '';

        for (let i = 1; i <= hotbarSlotCount; i++) {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot';
            slot.dataset.slot = i;

            const key = document.createElement('span');
            key.className = 'hotbar-key';
            key.textContent = i;
            slot.appendChild(key);

            // Right click to remove
            slot.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                const idx = hotbar.findIndex(h => h && h.slot === i);
                if (idx !== -1) {
                    hotbar.splice(idx, 1);
                    renderHotbar();
                    saveHotbar();
                }
            });

            hotbarEl.appendChild(slot);
        }
    }

    function renderHotbar() {
        const slots = document.querySelectorAll('.hotbar-slot');
        for (const slot of slots) {
            const slotNum = parseInt(slot.dataset.slot);
            const assignment = hotbar.find(h => h && h.slot === slotNum);

            // Clear content except key label
            const key = slot.querySelector('.hotbar-key');
            slot.innerHTML = '';
            slot.appendChild(key);

            if (assignment) {
                const def = itemDefs[assignment.itemRef.name];
                if (def) {
                    const img = new Image();
                    img.className = 'hotbar-item-img';
                    img.src = `img/${def.image}`;
                    img.onerror = function () {
                        this.style.display = 'none';
                        const ph = document.createElement('div');
                        ph.className = 'hotbar-item-placeholder';
                        ph.textContent = def.label;
                        slot.appendChild(ph);
                    };
                    slot.appendChild(img);
                }
            }
        }
    }

    function assignHotbar(slotNum, dragInfo) {
        // Remove existing assignment for this slot
        hotbar = hotbar.filter(h => h.slot !== slotNum);

        hotbar.push({
            slot: slotNum,
            itemRef: {
                name: dragInfo.item.name,
                x: dragInfo.item.x,
                y: dragInfo.item.y,
                grid: dragInfo.gridId,
            },
        });

        renderHotbar();
        saveHotbar();
    }

    function saveHotbar() {
        nuiCallback('updateHotbar', { hotbar: hotbar });
    }

    function useHotbarSlot(slotNum) {
        const assignment = hotbar.find(h => h && h.slot === slotNum);
        if (!assignment) return;

        // Find the item in the grid
        const grid = getGrid(assignment.itemRef.grid);
        if (!grid) return;

        // Search for the item by name and position
        let itemIndex = -1;
        for (let i = 0; i < grid.items.length; i++) {
            if (grid.items[i].name === assignment.itemRef.name) {
                itemIndex = i;
                break;
            }
        }

        if (itemIndex === -1) {
            // Item no longer exists, remove from hotbar
            hotbar = hotbar.filter(h => h.slot !== slotNum);
            renderHotbar();
            saveHotbar();
            return;
        }

        nuiCallback('useHotbarItem', {
            grid: assignment.itemRef.grid,
            itemIndex: itemIndex + 1, // Lua 1-indexed
        });
    }

    // ============================================
    // CONTEXT MENU
    // ============================================

    function initContextMenu() {
        document.addEventListener('contextmenu', function (e) {
            e.preventDefault();

            if (DragSystem.isActive()) return;

            const itemEl = e.target.closest('.grid-item');
            if (!itemEl) {
                hideContextMenu();
                return;
            }

            const gridId = itemEl.dataset.gridId;
            const itemIndex = parseInt(itemEl.dataset.itemIndex);
            const grid = getGrid(gridId);
            if (!grid) return;

            const item = grid.getItem(itemIndex);
            if (!item) return;

            const def = itemDefs[item.name];
            if (!def) return;

            contextTarget = { grid, gridId, itemIndex, item, def };

            const options = [];

            // Use
            if (def.usable) {
                options.push({
                    label: 'Use',
                    action: function () {
                        nuiCallback('useItem', {
                            grid: gridId,
                            itemIndex: itemIndex + 1,
                        });
                    },
                });
            }

            // Split (only if stackable and count > 1)
            if (def.stackable && (item.count || 1) > 1) {
                options.push({
                    label: 'Split',
                    action: function () {
                        showSplitDialog(contextTarget);
                    },
                });
            }

            // Assign to hotbar
            options.push({
                label: 'Assign to Hotbar',
                submenu: true,
                action: function () {
                    showHotbarAssignMenu(e.clientX, e.clientY, contextTarget);
                },
            });

            // Drop
            options.push({ separator: true });
            options.push({
                label: 'Drop',
                action: function () {
                    nuiCallback('dropItem', {
                        grid: gridId,
                        itemIndex: itemIndex + 1,
                        count: item.count || 1,
                    });
                    grid.removeItem(itemIndex);
                    updateWeightDisplays();
                },
            });

            showContextMenu(e.clientX, e.clientY, options);
        });

        // Close context menu on left click
        document.addEventListener('click', function (e) {
            if (!e.target.closest('#context-menu')) {
                hideContextMenu();
            }
        });
    }

    function showContextMenu(x, y, options) {
        const menu = document.getElementById('context-menu');
        menu.innerHTML = '';
        menu.classList.remove('hidden');

        for (const opt of options) {
            if (opt.separator) {
                const sep = document.createElement('div');
                sep.className = 'ctx-separator';
                menu.appendChild(sep);
                continue;
            }

            const item = document.createElement('div');
            item.className = 'ctx-item';
            item.textContent = opt.label;
            item.addEventListener('click', function () {
                hideContextMenu();
                opt.action();
            });
            menu.appendChild(item);
        }

        // Position
        const menuRect = menu.getBoundingClientRect();
        const maxX = window.innerWidth - 160;
        const maxY = window.innerHeight - menu.offsetHeight;
        menu.style.left = Math.min(x, maxX) + 'px';
        menu.style.top = Math.min(y, maxY) + 'px';
    }

    function showHotbarAssignMenu(x, y, target) {
        const options = [];
        for (let i = 1; i <= hotbarSlotCount; i++) {
            const slotNum = i;
            options.push({
                label: `Slot ${i}`,
                action: function () {
                    assignHotbar(slotNum, {
                        item: target.item,
                        gridId: target.gridId,
                    });
                },
            });
        }
        showContextMenu(x + 10, y, options);
    }

    function hideContextMenu() {
        const menu = document.getElementById('context-menu');
        menu.classList.add('hidden');
        contextTarget = null;
    }

    // ============================================
    // SPLIT DIALOG
    // ============================================

    function showSplitDialog(target) {
        const dialog = document.getElementById('split-dialog');
        dialog.classList.remove('hidden');

        const totalCount = target.item.count || 1;
        document.getElementById('split-item-name').textContent = target.def.label;
        document.getElementById('split-total').textContent = `Total: ${totalCount}`;

        const slider = document.getElementById('split-slider');
        slider.min = 1;
        slider.max = totalCount - 1;
        slider.value = Math.floor(totalCount / 2);
        updateSplitDisplay(totalCount, parseInt(slider.value));

        slider.oninput = function () {
            updateSplitDisplay(totalCount, parseInt(this.value));
        };

        document.getElementById('split-confirm').onclick = function () {
            const splitCount = parseInt(slider.value);
            const grid = target.grid;
            const def = target.def;

            // Find free position for new stack
            const size = target.item.rotated
                ? { w: def.sizeY, h: def.sizeX }
                : { w: def.sizeX, h: def.sizeY };
            const freePos = grid.findFreePosition(size.w, size.h);

            if (!freePos) {
                // No space to split
                hideSplitDialog();
                return;
            }

            nuiCallback('splitStack', {
                owner: getGridOwner(target.gridId),
                invType: getGridInvType(target.gridId),
                grid: target.gridId,
                itemIndex: target.itemIndex + 1,
                splitCount: splitCount,
                x: freePos.x,
                y: freePos.y,
                rotated: freePos.rotated,
            });

            hideSplitDialog();
        };

        document.getElementById('split-cancel').onclick = function () {
            hideSplitDialog();
        };
    }

    function updateSplitDisplay(total, splitVal) {
        document.getElementById('split-left').textContent = total - splitVal;
        document.getElementById('split-right').textContent = splitVal;
    }

    function hideSplitDialog() {
        document.getElementById('split-dialog').classList.add('hidden');
    }

    function handleSplitSuccess(data) {
        // Reload the affected grid
        // The server will have updated, we do optimistic here
        const grid = getGrid(data.grid);
        if (!grid) return;

        // Update original item count
        const item = grid.items[data.itemIndex - 1];
        if (item) {
            item.count = item.count - data.splitCount;
            const countEl = item.el ? item.el.querySelector('.item-count') : null;
            if (countEl) {
                const def = itemDefs[item.name];
                countEl.textContent = `${item.count}/${def.maxStack}`;
            }
        }

        // Add new split item
        grid.addItem(
            { name: item.name, count: data.splitCount, metadata: {} },
            data.x, data.y, data.rotated
        );

        updateWeightDisplays();
    }

    // ============================================
    // SORT
    // ============================================

    function initSort() {
        document.getElementById('btn-sort-v').addEventListener('click', function () {
            sortActiveGrid('vertical');
        });
        document.getElementById('btn-sort-h').addEventListener('click', function () {
            sortActiveGrid('horizontal');
        });
    }

    function sortActiveGrid(mode) {
        // Sort player grid by default, or focused grid
        nuiCallback('sortInventory', {
            owner: null,
            invType: 'player',
            grid: 'player',
            mode: mode,
        });
    }

    function handleSortComplete(data) {
        const grid = getGrid(data.grid);
        if (!grid) return;
        grid.loadItems(data.items);
        grid.rebuildOccupied();
        updateWeightDisplays();
    }

    // ============================================
    // TOOLTIP
    // ============================================

    function initTooltip() {
        document.addEventListener('mouseover', function (e) {
            if (DragSystem.isActive()) return;

            const itemEl = e.target.closest('.grid-item');
            if (!itemEl) {
                hideTooltip();
                return;
            }

            const itemName = itemEl.dataset.itemName;
            const def = itemDefs[itemName];
            if (!def) return;

            const gridId = itemEl.dataset.gridId;
            const itemIndex = parseInt(itemEl.dataset.itemIndex);
            const grid = getGrid(gridId);
            const item = grid ? grid.getItem(itemIndex) : null;

            showTooltip(e.clientX, e.clientY, def, item);
        });

        document.addEventListener('mousemove', function (e) {
            const tooltip = document.getElementById('tooltip');
            if (!tooltip.classList.contains('hidden')) {
                positionTooltip(e.clientX, e.clientY);
            }
        });

        document.addEventListener('mouseout', function (e) {
            const itemEl = e.target.closest('.grid-item');
            if (itemEl) {
                const related = e.relatedTarget;
                if (!related || !related.closest('.grid-item')) {
                    hideTooltip();
                }
            }
        });
    }

    function showTooltip(x, y, def, item) {
        const tooltip = document.getElementById('tooltip');
        document.getElementById('tooltip-name').textContent = def.label;
        document.getElementById('tooltip-desc').textContent = def.description || '';

        let info = `Weight: ${(def.weight / 1000).toFixed(1)} kg`;
        info += `\nSize: ${def.sizeX}x${def.sizeY}`;
        if (def.stackable) {
            info += `\nStack: ${item ? item.count || 1 : 1}/${def.maxStack}`;
        }
        if (item && item.rotated) {
            info += '\n[Rotated]';
        }
        info += `\n[R] Rotate during drag`;
        document.getElementById('tooltip-info').textContent = info;

        tooltip.classList.remove('hidden');
        positionTooltip(x, y);
    }

    function positionTooltip(x, y) {
        const tooltip = document.getElementById('tooltip');
        const offset = 15;
        let left = x + offset;
        let top = y + offset;

        if (left + 220 > window.innerWidth) left = x - 220 - offset;
        if (top + tooltip.offsetHeight > window.innerHeight) top = y - tooltip.offsetHeight - offset;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    function hideTooltip() {
        document.getElementById('tooltip').classList.add('hidden');
    }

    // ============================================
    // USE ITEM
    // ============================================

    function handleUseSuccess(data) {
        const grid = getGrid(data.grid);
        if (!grid) return;

        const itemIndex = data.itemIndex - 1;
        const item = grid.items[itemIndex];
        if (!item) return;

        const def = itemDefs[item.name];
        if (def && def.stackable && def.usable) {
            item.count = (item.count || 1) - 1;
            if (item.count <= 0) {
                grid.removeItem(itemIndex);
                // Check if hotbar references this item
                hotbar = hotbar.filter(h => h.itemRef.name !== item.name || h.itemRef.grid !== data.grid);
                renderHotbar();
                saveHotbar();
            } else {
                const countEl = item.el ? item.el.querySelector('.item-count') : null;
                if (countEl) countEl.textContent = `${item.count}/${def.maxStack}`;
            }
        }
        updateWeightDisplays();
    }

    // ============================================
    // MOVE FAILED
    // ============================================

    function handleMoveFailed() {
        // The optimistic update may have gone through;
        // Safest: request full refresh from server
        // For now we just log - in practice the server would re-send state
        console.warn('[CNBT] Move failed - state may be out of sync');
    }

    // ============================================
    // WEIGHT DISPLAY
    // ============================================

    function updateWeightDisplays() {
        if (playerGrid) {
            const w = playerGrid.getWeight();
            const el = document.getElementById('player-weight');
            el.textContent = `${(w / 1000).toFixed(1)} / ${(playerGrid.maxWeight / 1000).toFixed(1)} kg`;
            el.classList.toggle('overweight', w > playerGrid.maxWeight);
        }

        if (backpackGrid) {
            const w = backpackGrid.getWeight();
            const el = document.getElementById('backpack-weight');
            el.textContent = `${(w / 1000).toFixed(1)} / ${(backpackGrid.maxWeight / 1000).toFixed(1)} kg`;
            el.classList.toggle('overweight', w > backpackGrid.maxWeight);
        }

        if (externalGrid) {
            const w = externalGrid.getWeight();
            const el = document.getElementById('external-weight');
            el.textContent = `${(w / 1000).toFixed(1)} / ${(externalGrid.maxWeight / 1000).toFixed(1)} kg`;
            el.classList.toggle('overweight', w > externalGrid.maxWeight);
        }
    }

    // ============================================
    // GRID ACCESSORS
    // ============================================

    function getGrid(gridId) {
        switch (gridId) {
            case 'player': return playerGrid;
            case 'backpack': return backpackGrid;
            case 'external': return externalGrid;
            default: return null;
        }
    }

    function getAllGrids() {
        const grids = [];
        if (playerGrid) grids.push(['player', playerGrid]);
        if (backpackGrid) grids.push(['backpack', backpackGrid]);
        if (externalGrid) grids.push(['external', externalGrid]);
        return grids;
    }

    function getGridOwner(gridId) {
        const meta = gridMeta[gridId];
        return meta ? meta.owner : null;
    }

    function getGridInvType(gridId) {
        const meta = gridMeta[gridId];
        return meta ? meta.invType : 'player';
    }

    function clearAllHighlights() {
        if (playerGrid) playerGrid.clearHighlights();
        if (backpackGrid) backpackGrid.clearHighlights();
        if (externalGrid) externalGrid.clearHighlights();
    }

    // ============================================
    // ESC KEY
    // ============================================

    function initEscKey() {
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                hideContextMenu();
                hideSplitDialog();
                nuiCallback('close', {});
            }
        });
    }

    // ============================================
    // WINDOW RESIZE
    // ============================================

    function initResize() {
        let resizeTimeout;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                if (playerGrid) {
                    playerGrid.invalidateSizeCache();
                    playerGrid._renderAllItems();
                }
                if (backpackGrid) {
                    backpackGrid.invalidateSizeCache();
                    backpackGrid._renderAllItems();
                }
                if (externalGrid) {
                    externalGrid.invalidateSizeCache();
                    externalGrid._renderAllItems();
                }
            }, 150);
        });
    }

    // ============================================
    // INIT
    // ============================================

    function init() {
        DragSystem.init();
        initContextMenu();
        initSort();
        initTooltip();
        initEscKey();
        initResize();
    }

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        itemDefs: itemDefs,
        get itemDefs() { return itemDefs; },
        nuiCallback,
        getGrid,
        getAllGrids,
        getGridOwner,
        getGridInvType,
        clearAllHighlights,
        updateWeightDisplays,
        assignHotbar,
    };
})();
