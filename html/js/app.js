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

    // Multi-select state: [{gridId, itemIndex, item}]
    let selectedItems = [];
    let lastClickedIndex = -1; // for shift+click range select
    let lastClickedGrid = null;

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
                handleBackpackEquipped(msg.backpack, msg.updatedItems);
                break;
            case 'backpackUnequipped':
                handleBackpackUnequipped(msg.updatedItems);
                break;
            case 'sortComplete':
                handleSortComplete(msg.data);
                break;
            case 'useHotbar':
                useHotbarSlot(msg.slot);
                break;
            // Gunsmith messages
            case 'openGunsmith':
            case 'closeGunsmith':
            case 'gunsmithAttachSuccess':
            case 'gunsmithDetachSuccess':
                if (window.Gunsmith) window.Gunsmith.handleMessage(msg);
                break;
        }
    });

    // ============================================
    // OPEN / CLOSE
    // ============================================

    let closeAnimTimeout = null;

    function handleOpen(msg) {
        itemDefs = msg.itemDefs || {};
        backpackConfigs = msg.backpackConfigs || {};
        hotbarSlotCount = msg.hotbarSlots || 5;

        const container = document.getElementById('inventory-container');
        // Cancel any pending close animation
        if (closeAnimTimeout) { clearTimeout(closeAnimTimeout); closeAnimTimeout = null; }
        container.classList.remove('hidden', 'slide-out');
        container.classList.add('slide-in');

        // Setup player grid
        const playerEl = document.getElementById('player-grid');
        const pd = msg.playerData;

        if (playerGrid) playerGrid.destroy();
        playerGrid = new InventoryGrid(playerEl, pd.cols, pd.rows, pd.maxWeight, 'player');
        playerGrid.loadItems(pd.items || []);
        gridMeta['player'] = { owner: null, invType: 'player' };

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
        clearSelection();
        hideContextMenu();
        hideSplitDialog();
    }

    function handleClose() {
        // Close gunsmith panel if open
        if (window.Gunsmith && window.Gunsmith.isOpen()) {
            window.Gunsmith.close();
        }

        const container = document.getElementById('inventory-container');
        // Play slide-out animation, then hide
        container.classList.remove('slide-in');
        container.classList.add('slide-out');

        closeAnimTimeout = setTimeout(function () {
            container.classList.add('hidden');
            container.classList.remove('slide-out');

            if (playerGrid) { playerGrid.destroy(); playerGrid = null; }
            if (backpackGrid) { backpackGrid.destroy(); backpackGrid = null; }
            if (externalGrid) { externalGrid.destroy(); externalGrid = null; }

            clearSelection();
            hideContextMenu();
            hideSplitDialog();
            hideTooltip();
            closeAnimTimeout = null;
        }, 300); // match --slide-duration
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

    function handleBackpackEquipped(bp, updatedItems) {
        equippedBackpack = bp;
        showBackpackGrid(bp);
        renderBackpackSlot();
        // Reload player grid with updated items (backpack removed from grid)
        if (playerGrid && updatedItems) {
            playerGrid.loadItems(updatedItems);
        }
        updateWeightDisplays();
    }

    function handleBackpackUnequipped(updatedItems) {
        equippedBackpack = null;
        hideBackpackGrid();
        renderBackpackSlot();
        // Reload player grid with updated items (backpack added back to grid)
        if (playerGrid && updatedItems) {
            playerGrid.loadItems(updatedItems);
        }
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
    // MULTI-SELECT (Ctrl+click, Shift+click)
    // ============================================

    function initSelection() {
        document.addEventListener('click', function (e) {
            if (DragSystem.isActive()) return;
            if (e.target.closest('#context-menu')) return;

            const itemEl = e.target.closest('.grid-item');

            // Clicking empty space clears selection (unless holding Ctrl)
            if (!itemEl) {
                if (!e.ctrlKey && !e.metaKey) {
                    clearSelection();
                }
                hideContextMenu();
                return;
            }

            const gridId = itemEl.dataset.gridId;
            const itemIndex = parseInt(itemEl.dataset.itemIndex);
            const grid = getGrid(gridId);
            if (!grid) return;

            const item = grid.getItem(itemIndex);
            if (!item) return;

            if (e.shiftKey && lastClickedGrid === gridId && lastClickedIndex >= 0) {
                // Shift+click: select range between last clicked and current
                const minIdx = Math.min(lastClickedIndex, itemIndex);
                const maxIdx = Math.max(lastClickedIndex, itemIndex);
                if (!e.ctrlKey && !e.metaKey) clearSelection();
                for (let i = minIdx; i <= maxIdx; i++) {
                    const rangeItem = grid.getItem(i);
                    if (rangeItem && !isSelected(gridId, i)) {
                        addToSelection(gridId, i, rangeItem, grid);
                    }
                }
            } else if (e.ctrlKey || e.metaKey) {
                // Ctrl+click: toggle selection
                if (isSelected(gridId, itemIndex)) {
                    removeFromSelection(gridId, itemIndex);
                } else {
                    addToSelection(gridId, itemIndex, item, grid);
                }
                lastClickedIndex = itemIndex;
                lastClickedGrid = gridId;
            } else {
                // Normal click: select only this item
                clearSelection();
                addToSelection(gridId, itemIndex, item, grid);
                lastClickedIndex = itemIndex;
                lastClickedGrid = gridId;
            }
        });
    }

    function isSelected(gridId, itemIndex) {
        return selectedItems.some(s => s.gridId === gridId && s.itemIndex === itemIndex);
    }

    function addToSelection(gridId, itemIndex, item, grid) {
        if (isSelected(gridId, itemIndex)) return;
        selectedItems.push({ gridId, itemIndex, item, grid });
        if (item.el) item.el.classList.add('selected');
    }

    function removeFromSelection(gridId, itemIndex) {
        const idx = selectedItems.findIndex(s => s.gridId === gridId && s.itemIndex === itemIndex);
        if (idx === -1) return;
        const sel = selectedItems[idx];
        if (sel.item && sel.item.el) sel.item.el.classList.remove('selected');
        selectedItems.splice(idx, 1);
    }

    function clearSelection() {
        for (const sel of selectedItems) {
            if (sel.item && sel.item.el) sel.item.el.classList.remove('selected');
        }
        selectedItems = [];
        lastClickedIndex = -1;
        lastClickedGrid = null;
    }

    function getSelectionCount() {
        return selectedItems.length;
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

            // If right-clicking on a non-selected item without Ctrl, select only it
            if (!isSelected(gridId, itemIndex) && !e.ctrlKey && !e.metaKey) {
                clearSelection();
                addToSelection(gridId, itemIndex, item, grid);
            }
            // If right-clicking on a selected item, keep current selection
            // If Ctrl+right-click on unselected, add to selection
            if (!isSelected(gridId, itemIndex)) {
                addToSelection(gridId, itemIndex, item, grid);
            }

            contextTarget = { grid, gridId, itemIndex, item, def };

            // Build context menu based on single vs multi-select
            if (selectedItems.length > 1) {
                buildMultiSelectContextMenu(e.clientX, e.clientY);
            } else {
                buildSingleItemContextMenu(e.clientX, e.clientY, gridId, itemIndex, item, def, grid);
            }
        });
    }

    function buildSingleItemContextMenu(x, y, gridId, itemIndex, item, def, grid) {
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

        // Accessories (only for weapons with attachment slots, player grid only)
        if (def.category === 'weapon' && def.weaponHash && gridId === 'player') {
            options.push({
                label: 'Accessories',
                action: function () {
                    nuiCallback('openGunsmith', {
                        itemIndex: itemIndex + 1,
                        gridId: gridId,
                        weaponName: item.name,
                    });
                },
            });
        }

        // Split (only if stackable and count > 1)
        if (def.stackable && (item.count || 1) > 1) {
            options.push({
                label: 'Split',
                action: function () {
                    showSplitDialog({ grid, gridId, itemIndex, item, def });
                },
            });
        }

        // Assign to hotbar
        options.push({
            label: 'Assign to Hotbar',
            action: function () {
                showHotbarAssignMenu(x, y, { item, gridId });
            },
        });

        // Drop
        options.push({ separator: true });
        options.push({
            label: 'Drop All',
            action: function () {
                nuiCallback('dropItem', {
                    grid: gridId,
                    itemIndex: itemIndex + 1,
                    count: item.count || 1,
                });
                grid.removeItem(itemIndex);
                clearSelection();
                updateWeightDisplays();
            },
        });

        // Drop specific quantity (only if stackable and count > 1)
        if (def.stackable && (item.count || 1) > 1) {
            options.push({
                label: 'Drop Amount...',
                action: function () {
                    showDropQuantityDialog({ grid, gridId, itemIndex, item, def });
                },
            });
        }

        showContextMenu(x, y, options);
    }

    function buildMultiSelectContextMenu(x, y) {
        const count = selectedItems.length;
        const options = [];

        // Header showing count
        options.push({ header: `${count} items selected` });
        options.push({ separator: true });

        // Drop all selected
        options.push({
            label: `Drop All (${count})`,
            action: function () {
                // Drop in reverse index order to avoid index shifting issues
                const sorted = [...selectedItems].sort((a, b) => b.itemIndex - a.itemIndex);
                for (const sel of sorted) {
                    nuiCallback('dropItem', {
                        grid: sel.gridId,
                        itemIndex: sel.itemIndex + 1,
                        count: sel.item.count || 1,
                    });
                    sel.grid.removeItem(sel.itemIndex);
                }
                clearSelection();
                updateWeightDisplays();
            },
        });

        // Use all selected (if all are usable)
        const allUsable = selectedItems.every(s => {
            const d = itemDefs[s.item.name];
            return d && d.usable;
        });
        if (allUsable) {
            options.push({
                label: `Use All (${count})`,
                action: function () {
                    for (const sel of selectedItems) {
                        nuiCallback('useItem', {
                            grid: sel.gridId,
                            itemIndex: sel.itemIndex + 1,
                        });
                    }
                    clearSelection();
                },
            });
        }

        showContextMenu(x, y, options);
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
            if (opt.header) {
                const hdr = document.createElement('div');
                hdr.className = 'ctx-header';
                hdr.textContent = opt.header;
                menu.appendChild(hdr);
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

        // Position - ensure menu stays on screen
        const maxX = window.innerWidth - 170;
        const maxY = window.innerHeight - menu.offsetHeight - 10;
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

    // ============================================
    // DROP QUANTITY DIALOG (reuses split dialog UI)
    // ============================================

    function showDropQuantityDialog(target) {
        const dialog = document.getElementById('split-dialog');
        dialog.classList.remove('hidden');

        const totalCount = target.item.count || 1;
        document.getElementById('split-item-name').textContent = 'Drop: ' + target.def.label;
        document.getElementById('split-total').textContent = `Total: ${totalCount}`;

        const slider = document.getElementById('split-slider');
        slider.min = 1;
        slider.max = totalCount;
        slider.value = 1;
        updateDropQuantityDisplay(totalCount, 1);

        slider.oninput = function () {
            updateDropQuantityDisplay(totalCount, parseInt(this.value));
        };

        document.getElementById('split-confirm').onclick = function () {
            const dropCount = parseInt(slider.value);
            nuiCallback('dropItem', {
                grid: target.gridId,
                itemIndex: target.itemIndex + 1,
                count: dropCount,
            });

            // Optimistic update
            if (dropCount >= totalCount) {
                target.grid.removeItem(target.itemIndex);
            } else {
                target.item.count = totalCount - dropCount;
                const countEl = target.item.el ? target.item.el.querySelector('.item-count') : null;
                if (countEl) countEl.textContent = `${target.item.count}/${target.def.maxStack}`;
            }

            updateWeightDisplays();
            hideSplitDialog();
        };

        document.getElementById('split-cancel').onclick = function () {
            hideSplitDialog();
        };
    }

    function updateDropQuantityDisplay(total, dropVal) {
        document.getElementById('split-left').textContent = 'Keep: ' + (total - dropVal);
        document.getElementById('split-right').textContent = 'Drop: ' + dropVal;
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
            // Player weight = items in player grid + backpack shell weight + backpack contents
            let w = playerGrid.getWeight();
            if (equippedBackpack) {
                const bpDef = itemDefs[equippedBackpack.name];
                if (bpDef) w += bpDef.weight; // backpack shell weight
                if (backpackGrid) w += backpackGrid.getWeight(); // backpack contents
            }
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
                // If gunsmith is open, close it first (return to inventory)
                if (window.Gunsmith && window.Gunsmith.isOpen()) {
                    nuiCallback('closeGunsmith', {});
                    return;
                }
                hideContextMenu();
                hideSplitDialog();
                nuiCallback('close', {});
            }
        });
    }

    // Reload player grid items (used by gunsmith after attach/detach)
    function reloadPlayerItems(items) {
        if (playerGrid) {
            playerGrid.loadItems(items);
            updateWeightDisplays();
        }
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
        initSelection();
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
        getItemDef: function (name) { return itemDefs[name]; },
        getItemDefs: function () { return itemDefs; },
        reloadPlayerItems,
    };
})();
