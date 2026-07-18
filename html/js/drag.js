/**
 * CNBT Inventory - Drag & Drop System
 *
 * GPU-accelerated dragging using transform: translate3d().
 * Pointer events for unified mouse/touch.
 * requestAnimationFrame for smooth 60fps updates.
 */

'use strict';

const DragSystem = (function () {
    // State
    let isDragging = false;
    let dragItem = null;       // { item, index, grid, originalX, originalY, originalRotated }
    let ghostEl = null;
    let currentRotated = false;
    let mouseX = 0, mouseY = 0;
    let rafId = null;

    // Offset from cursor to item top-left during drag
    let offsetX = 0, offsetY = 0;

    // Currently hovered grid
    let hoverGrid = null;
    let hoverGridX = 0, hoverGridY = 0;

    function init() {
        ghostEl = document.getElementById('drag-ghost');

        // Use pointer events on the body for global tracking
        document.addEventListener('pointerdown', onPointerDown, { passive: false });
        document.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerup', onPointerUp, { passive: false });

        // R key for rotation during drag
        document.addEventListener('keydown', onKeyDown);
    }

    function onPointerDown(e) {
        if (e.button !== 0) return; // Left click only

        // Check if clicked on a grid item
        const itemEl = e.target.closest('.grid-item');
        if (!itemEl) return;

        e.preventDefault();

        const gridId = itemEl.dataset.gridId;
        const itemIndex = parseInt(itemEl.dataset.itemIndex);
        const grid = window.CNBT.getGrid(gridId);
        if (!grid) return;

        const item = grid.getItem(itemIndex);
        if (!item) return;

        // Calculate offset
        const rect = itemEl.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // Start drag
        isDragging = true;
        currentRotated = item.rotated;
        dragItem = {
            item: { ...item },
            index: itemIndex,
            grid: grid,
            gridId: gridId,
            originalX: item.x,
            originalY: item.y,
            originalRotated: item.rotated,
        };

        // Mark original element as dragging (faded)
        itemEl.classList.add('dragging');

        // Setup ghost
        setupGhost(item);
        mouseX = e.clientX;
        mouseY = e.clientY;
        updateGhostPosition();

        // Highlight gunsmith slots when dragging an attachment
        if (window.Gunsmith && window.Gunsmith.isOpen() && window.Gunsmith.highlightAllSlots) {
            const def = window.CNBT.itemDefs[item.name];
            if (def && def.category === 'attachment') {
                window.Gunsmith.highlightAllSlots(item.name);
            }
        }

        // Highlight the matching stickman zone when dragging helmet/vest
        // (clothing tab) and the valid medical targets (health tab)
        if (window.UtilityPanel && window.UtilityPanel.isOpen()) {
            const gDef = window.CNBT.itemDefs[item.name];
            if (gDef && (gDef.category === 'helmet' || gDef.category === 'vest')) {
                window.UtilityPanel.highlightGearZone(gDef.category, true);
            }
        }
        if (window.HealthPanel && window.HealthPanel.isPanelActive()
            && (gridId === 'player' || gridId === 'backpack')) {
            window.HealthPanel.highlightTargets(item.name);
        }

        // Start render loop
        if (!rafId) {
            rafId = requestAnimationFrame(renderLoop);
        }
    }

    function onPointerMove(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }

    function onPointerUp(e) {
        if (!isDragging) return;

        // Stop render loop
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        // Hide ghost
        ghostEl.classList.add('hidden');

        // Clear highlights on all grids
        window.CNBT.clearAllHighlights();

        // Clear gunsmith slot highlights
        if (window.Gunsmith && window.Gunsmith.clearSlotHighlights) {
            window.Gunsmith.clearSlotHighlights();
        }

        // Clear stickman / health target highlights
        if (window.UtilityPanel) window.UtilityPanel.clearGearZoneHighlights();
        if (window.HealthPanel) window.HealthPanel.clearTargetHighlights();

        // Check if dropped on a gunsmith attachment slot
        if (window.Gunsmith && window.Gunsmith.isOpen()) {
            const def = window.CNBT.itemDefs[dragItem.item.name];
            if (def && def.category === 'attachment') {
                const gsResult = window.Gunsmith.getHoveredSlot(e.clientX, e.clientY, dragItem.item.name);
                if (gsResult && gsResult.compatible) {
                    window.Gunsmith.handleSlotDrop(gsResult.slot, dragItem.item.name);
                    finishDrag();
                    return;
                }
                if (gsResult) {
                    // Dropped on incompatible slot - revert
                    revertDrag();
                    finishDrag();
                    return;
                }
            }
        }

        // Determine drop target
        const dropResult = getDropTarget(e.clientX, e.clientY);

        if (dropResult) {
            handleDrop(dropResult);
        } else {
            // Check if dropped on a medical target (health tab stickman /
            // blood bar) with a treatment item
            if (window.HealthPanel && (dragItem.gridId === 'player' || dragItem.gridId === 'backpack')) {
                const hTarget = window.HealthPanel.getDropTargetAt(e.clientX, e.clientY, dragItem.item.name);
                if (hTarget) {
                    handleHealthDrop(hTarget.zone);
                    finishDrag();
                    return;
                }
            }

            // Check if dropped on backpack equipment slot (utility panel)
            const bpSlot = document.getElementById('equip-backpack');
            if (bpSlot && !bpSlot.closest('.hidden')) {
                const bpRect = bpSlot.getBoundingClientRect();
                if (e.clientX >= bpRect.left && e.clientX <= bpRect.right &&
                    e.clientY >= bpRect.top && e.clientY <= bpRect.bottom) {
                    handleBackpackEquip();
                    finishDrag();
                    return;
                }
            }

            // Check if dropped on helmet/vest gear slot or on the matching
            // stickman zone (clothing tab)
            const gearSlot = getGearDropSlot(e.clientX, e.clientY);
            if (gearSlot) {
                handleGearEquip(gearSlot);
                finishDrag();
                return;
            }

            // Check if dropped on parachute equipment slot (utility panel)
            const paraSlot = document.getElementById('equip-parachute');
            if (paraSlot && !paraSlot.closest('.hidden')) {
                const paraRect = paraSlot.getBoundingClientRect();
                if (e.clientX >= paraRect.left && e.clientX <= paraRect.right &&
                    e.clientY >= paraRect.top && e.clientY <= paraRect.bottom) {
                    handleEquipSlot('parachute');
                    finishDrag();
                    return;
                }
            }

            // Check if dropped on a hotbar slot
            const hotbarSlot = document.elementFromPoint(e.clientX, e.clientY);
            if (hotbarSlot && hotbarSlot.closest('.hotbar-slot')) {
                const slot = hotbarSlot.closest('.hotbar-slot');
                const slotIndex = parseInt(slot.dataset.slot);
                window.CNBT.assignHotbar(slotIndex, dragItem);
                finishDrag();
                return;
            }

            // Revert
            revertDrag();
        }

        finishDrag();
    }

    function onKeyDown(e) {
        if (!isDragging) return;

        if (e.key === 'r' || e.key === 'R') {
            currentRotated = !currentRotated;
            updateGhostSize();
        }
    }

    function setupGhost(item) {
        const def = window.CNBT.itemDefs[item.name];
        if (!def) return;

        ghostEl.innerHTML = '';
        ghostEl.classList.remove('hidden');

        const img = new Image();
        img.src = `img/${def.image}`;
        img.style.width = '80%';
        img.style.height = '60%';
        img.style.objectFit = 'contain';
        img.onerror = function () {
            this.style.display = 'none';
            const ph = document.createElement('div');
            ph.className = 'ghost-label';
            ph.textContent = def.label;
            ghostEl.appendChild(ph);
        };
        ghostEl.appendChild(img);

        const label = document.createElement('div');
        label.className = 'ghost-label';
        label.textContent = def.label;
        ghostEl.appendChild(label);

        updateGhostSize();
    }

    function updateGhostSize() {
        const def = window.CNBT.itemDefs[dragItem.item.name];
        if (!def) return;

        const size = currentRotated
            ? { w: def.sizeY, h: def.sizeX }
            : { w: def.sizeX, h: def.sizeY };

        const cellSize = dragItem.grid._getCellSize();
        const gap = dragItem.grid._getGap();

        ghostEl.style.width = (size.w * cellSize + (size.w - 1) * gap) + 'px';
        ghostEl.style.height = (size.h * cellSize + (size.h - 1) * gap) + 'px';

        // Adjust offset for new size
        offsetX = Math.min(offsetX, parseInt(ghostEl.style.width));
        offsetY = Math.min(offsetY, parseInt(ghostEl.style.height));
    }

    function updateGhostPosition() {
        const x = mouseX - offsetX;
        const y = mouseY - offsetY;
        ghostEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    /**
     * Main render loop: runs at 60fps during drag
     * Updates ghost position and grid highlights
     */
    function renderLoop() {
        if (!isDragging) return;

        updateGhostPosition();
        updateHighlights();

        rafId = requestAnimationFrame(renderLoop);
    }

    function updateHighlights() {
        window.CNBT.clearAllHighlights();

        // Gunsmith slot hover highlight during drag (green/red base glow is set once at drag start)
        if (window.Gunsmith && window.Gunsmith.isOpen()) {
            const def = window.CNBT.itemDefs[dragItem.item.name];
            if (def && def.category === 'attachment') {
                // Remove previous hover emphasis
                var prevHover = document.querySelector('.gs-slot-hover');
                if (prevHover) prevHover.classList.remove('gs-slot-hover');

                const gsResult = window.Gunsmith.getHoveredSlot(mouseX, mouseY, dragItem.item.name);
                if (gsResult && gsResult.element) {
                    window.Gunsmith.highlightSlot(gsResult.element, gsResult.compatible);
                }
            }
        }

        const grids = window.CNBT.getAllGrids();
        hoverGrid = null;

        for (const [id, grid] of grids) {
            const rect = grid.container.getBoundingClientRect();
            if (mouseX >= rect.left && mouseX <= rect.right &&
                mouseY >= rect.top && mouseY <= rect.bottom) {

                hoverGrid = grid;

                // Convert to grid coordinates
                const relX = mouseX - offsetX - rect.left;
                const relY = mouseY - offsetY - rect.top;
                const gCoords = grid.pixelToGrid(relX, relY);

                const def = window.CNBT.itemDefs[dragItem.item.name];
                if (!def) break;

                const size = currentRotated
                    ? { w: def.sizeY, h: def.sizeX }
                    : { w: def.sizeX, h: def.sizeY };

                // Check if this is the same grid and same item
                const excludeIdx = (grid === dragItem.grid) ? dragItem.index : -1;
                let canPlace = grid.canPlace(gCoords.x, gCoords.y, size.w, size.h, excludeIdx);

                // Case filter: block items that don't match the grid's filter
                if (canPlace && grid.filter && grid !== dragItem.grid) {
                    canPlace = window.CNBT.itemPassesFilter(dragItem.item.name, grid.filter);
                }

                hoverGridX = gCoords.x;
                hoverGridY = gCoords.y;

                grid.highlightCells(gCoords.x, gCoords.y, size.w, size.h, canPlace);
                break;
            }
        }

        // Equipment slot drag-over highlights
        highlightEquipSlots();

        // Medical target hover highlight (health tab)
        if (window.HealthPanel && (dragItem.gridId === 'player' || dragItem.gridId === 'backpack')) {
            window.HealthPanel.hoverTargetAt(mouseX, mouseY, dragItem.item.name);
        }
    }

    function highlightEquipSlots() {
        const def = window.CNBT.itemDefs[dragItem.item.name];
        if (!def) return;

        // Map categories to slot IDs
        const slotMap = {
            backpack:  'equip-backpack',
            helmet:    'equip-helmet',
            vest:      'equip-vest',
            parachute: 'equip-parachute',
        };

        for (const [cat, slotId] of Object.entries(slotMap)) {
            const el = document.getElementById(slotId);
            if (!el || el.closest('.hidden')) {
                continue;
            }
            const rect = el.getBoundingClientRect();
            const over = mouseX >= rect.left && mouseX <= rect.right &&
                         mouseY >= rect.top && mouseY <= rect.bottom;

            if (over && def.category === cat) {
                el.classList.add('drag-over');
            } else {
                el.classList.remove('drag-over');
            }
        }
    }

    function getDropTarget(px, py) {
        const grids = window.CNBT.getAllGrids();

        for (const [id, grid] of grids) {
            const rect = grid.container.getBoundingClientRect();
            if (px >= rect.left && px <= rect.right &&
                py >= rect.top && py <= rect.bottom) {

                const relX = px - offsetX - rect.left;
                const relY = py - offsetY - rect.top;
                const gCoords = grid.pixelToGrid(relX, relY);

                const def = window.CNBT.itemDefs[dragItem.item.name];
                if (!def) return null;

                const size = currentRotated
                    ? { w: def.sizeY, h: def.sizeX }
                    : { w: def.sizeX, h: def.sizeY };

                const excludeIdx = (grid === dragItem.grid) ? dragItem.index : -1;
                const canPlace = grid.canPlace(gCoords.x, gCoords.y, size.w, size.h, excludeIdx);

                // Case filter: block items that don't match the grid's filter
                const passesFilter = !grid.filter || grid === dragItem.grid ||
                    window.CNBT.itemPassesFilter(dragItem.item.name, grid.filter);

                if (canPlace && passesFilter) {
                    return {
                        grid: grid,
                        gridId: id,
                        x: gCoords.x,
                        y: gCoords.y,
                        rotated: currentRotated,
                    };
                }

                // Check if dropping on same item type for stacking
                if (passesFilter) {
                    const targetOccupant = grid.getItemAt(gCoords.x, gCoords.y);
                    if (targetOccupant && targetOccupant.item.name === dragItem.item.name) {
                        const targetDef = window.CNBT.itemDefs[targetOccupant.item.name];
                        if (targetDef && targetDef.stackable) {
                            return {
                                grid: grid,
                                gridId: id,
                                stackTarget: targetOccupant,
                                isStack: true,
                            };
                        }
                    }
                }

                return null; // Over grid but can't place
            }
        }
        return null;
    }

    function handleDrop(dropResult) {
        if (dropResult.isStack) {
            handleStack(dropResult);
            return;
        }

        const srcGrid = dragItem.grid;
        const dstGrid = dropResult.grid;

        if (srcGrid === dstGrid) {
            // Move within same grid
            window.CNBT.nuiCallback('moveItem', {
                owner: window.CNBT.getGridOwner(dragItem.gridId),
                invType: window.CNBT.getGridInvType(dragItem.gridId),
                grid: dragItem.gridId,
                itemIndex: dragItem.index + 1, // Lua 1-indexed
                x: dropResult.x,
                y: dropResult.y,
                rotated: dropResult.rotated,
            });

            // Optimistic update
            srcGrid.moveItem(dragItem.index, dropResult.x, dropResult.y, dropResult.rotated);
        } else {
            // Transfer between grids
            window.CNBT.nuiCallback('transferItem', {
                srcOwner: window.CNBT.getGridOwner(dragItem.gridId),
                srcInvType: window.CNBT.getGridInvType(dragItem.gridId),
                srcGrid: dragItem.gridId,
                itemIndex: dragItem.index + 1,
                dstOwner: window.CNBT.getGridOwner(dropResult.gridId),
                dstInvType: window.CNBT.getGridInvType(dropResult.gridId),
                dstGrid: dropResult.gridId,
                x: dropResult.x,
                y: dropResult.y,
                rotated: dropResult.rotated,
            });

            // Optimistic update
            const removedItem = srcGrid.removeItem(dragItem.index);
            if (removedItem) {
                dstGrid.addItem(removedItem, dropResult.x, dropResult.y, dropResult.rotated);
            }
        }

        window.CNBT.updateWeightDisplays();
    }

    function handleStack(dropResult) {
        const srcGrid = dragItem.grid;
        const dstGrid = dropResult.grid;
        const target = dropResult.stackTarget;

        if (srcGrid === dstGrid) {
            window.CNBT.nuiCallback('stackItem', {
                owner: window.CNBT.getGridOwner(dragItem.gridId),
                invType: window.CNBT.getGridInvType(dragItem.gridId),
                grid: dragItem.gridId,
                srcIndex: dragItem.index + 1,
                dstIndex: target.index + 1,
            });
        } else {
            // Cross-grid stacking: transfer first
            window.CNBT.nuiCallback('transferItem', {
                srcOwner: window.CNBT.getGridOwner(dragItem.gridId),
                srcInvType: window.CNBT.getGridInvType(dragItem.gridId),
                srcGrid: dragItem.gridId,
                itemIndex: dragItem.index + 1,
                dstOwner: window.CNBT.getGridOwner(dropResult.gridId),
                dstInvType: window.CNBT.getGridInvType(dropResult.gridId),
                dstGrid: dropResult.gridId,
                x: target.item.x,
                y: target.item.y,
                rotated: target.item.rotated,
            });
        }

        // Optimistic stack update
        const def = window.CNBT.itemDefs[dragItem.item.name];
        if (def) {
            const maxStack = def.maxStack || 1;
            const space = maxStack - (target.item.count || 1);
            const toTransfer = Math.min(space, dragItem.item.count || 1);

            if (toTransfer > 0) {
                target.item.count = (target.item.count || 1) + toTransfer;
                dragItem.item.count = (dragItem.item.count || 1) - toTransfer;

                // Update target display
                const countEl = target.item.el ? target.item.el.querySelector('.item-count') : null;
                if (countEl) countEl.textContent = `${target.item.count}/${maxStack}`;

                if (dragItem.item.count <= 0) {
                    srcGrid.removeItem(dragItem.index);
                } else {
                    // Update source display
                    const srcCountEl = srcGrid.items[dragItem.index].el ?
                        srcGrid.items[dragItem.index].el.querySelector('.item-count') : null;
                    if (srcCountEl) srcCountEl.textContent = `${dragItem.item.count}/${maxStack}`;
                    srcGrid.items[dragItem.index].count = dragItem.item.count;
                }
            }
        }

        window.CNBT.updateWeightDisplays();
    }

    function handleBackpackEquip() {
        const def = window.CNBT.itemDefs[dragItem.item.name];
        if (!def || def.category !== 'backpack') return;

        window.CNBT.nuiCallback('equipBackpack', {
            itemIndex: dragItem.index + 1,
        });
    }

    function handleEquipSlot(slotType) {
        const def = window.CNBT.itemDefs[dragItem.item.name];
        if (!def) return;

        // Validate item matches slot type
        if (slotType === 'parachute' && def.category !== 'parachute') return;

        window.CNBT.nuiCallback('equipSlot', {
            slot: slotType,
            itemIndex: dragItem.index + 1,
            grid: dragItem.gridId,
        });
    }

    /**
     * Slot gear ('helmet'|'vest') su cui e' avvenuto il drop, oppure null.
     * Accetta sia il drop sullo slot dedicato che sulla zona corrispondente
     * dello stickman della scheda Vestiario (testa / torso).
     */
    function getGearDropSlot(x, y) {
        const def = window.CNBT.itemDefs[dragItem.item.name];
        if (!def || (def.category !== 'helmet' && def.category !== 'vest')) return null;
        // Il gear si puo' indossare solo dall'inventario del player / zaino
        if (dragItem.gridId !== 'player' && dragItem.gridId !== 'backpack') return null;

        const slotEl = document.getElementById(def.category === 'helmet' ? 'equip-helmet' : 'equip-vest');
        if (slotEl && !slotEl.closest('.hidden')) {
            const rect = slotEl.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return def.category;
            }
        }

        // Drop direttamente sulla testa/torso dello stickman
        if (window.UtilityPanel && window.UtilityPanel.isPointOnGearZone(def.category, x, y)) {
            return def.category;
        }
        return null;
    }

    function handleGearEquip(slot) {
        window.CNBT.nuiCallback('equipGear', {
            slot: slot,
            itemIndex: dragItem.index + 1, // Lua 1-indexed
            grid: dragItem.gridId,
        });
    }

    // Trattamento medico rilasciato su una zona dello stickman salute
    // (o 'blood' per la barra del sangue). La validazione e il consumo
    // sono lato server; qui parte solo la progressbar.
    function handleHealthDrop(zone) {
        window.CNBT.nuiCallback('applyHealthTreatment', {
            zone: zone,
            itemName: dragItem.item.name,
            grid: dragItem.gridId,
            itemIndex: dragItem.index + 1, // Lua 1-indexed
        });
        if (window.HealthPanel) {
            window.HealthPanel.startProgress(dragItem.item.name, zone);
        }
    }

    function revertDrag() {
        // Unfade original element
        if (dragItem && dragItem.grid) {
            const item = dragItem.grid.items[dragItem.index];
            if (item && item.el) {
                item.el.classList.remove('dragging');
            }
        }
    }

    function finishDrag() {
        // Unfade
        if (dragItem && dragItem.grid) {
            const item = dragItem.grid.items[dragItem.index];
            if (item && item.el) {
                item.el.classList.remove('dragging');
            }
        }

        // Clear equipment slot highlights
        document.querySelectorAll('.equip-slot.drag-over').forEach(function (el) {
            el.classList.remove('drag-over');
        });

        isDragging = false;
        dragItem = null;
        currentRotated = false;
        hoverGrid = null;
    }

    function isActive() {
        return isDragging;
    }

    return {
        init,
        isActive,
    };
})();

window.DragSystem = DragSystem;
