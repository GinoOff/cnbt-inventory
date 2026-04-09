/**
 * CNBT Inventory - Gunsmith Module
 *
 * CoD MW3-style weapon customization screen.
 * Renders attachment slots around a transparent center
 * where the game engine displays the 3D weapon model.
 * Mouse drag rotates the weapon via Lua callbacks.
 */

'use strict';

window.Gunsmith = (function () {
    // State
    let isOpen = false;
    let weaponName = null;
    let weaponLabel = '';
    let weaponItemIndex = null;
    let weaponGrid = null;
    let slots = {};        // slot data from server
    let attachments = {};  // current attachments { slot: itemName }
    let playerAttachments = {}; // { itemName: count } available in inventory
    let activeSlot = null; // currently selected slot for attachment picker

    // Drag rotation state
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // ============================================
    // NUI MESSAGE HANDLER
    // ============================================

    function handleMessage(msg) {
        switch (msg.type) {
            case 'openGunsmith':
                open(msg);
                break;
            case 'closeGunsmith':
                close();
                break;
            case 'gunsmithAttachSuccess':
                handleAttachSuccess(msg);
                break;
            case 'gunsmithDetachSuccess':
                handleDetachSuccess(msg);
                break;
        }
    }

    // ============================================
    // OPEN / CLOSE
    // ============================================

    function open(msg) {
        weaponName = msg.weaponName;
        weaponLabel = msg.weaponLabel;
        weaponItemIndex = msg.itemIndex;
        weaponGrid = msg.gridId;
        slots = msg.slots || {};
        attachments = msg.attachments || {};
        activeSlot = null;

        isOpen = true;

        // Show overlay FIRST (before any code that might fail)
        const overlay = document.getElementById('gunsmith-overlay');
        overlay.classList.remove('hidden');
        overlay.classList.add('gunsmith-fade-in');

        // Hide inventory panels while gunsmith is open
        const invContainer = document.getElementById('inventory-container');
        if (invContainer) invContainer.style.opacity = '0';
        if (invContainer) invContainer.style.pointerEvents = 'none';

        // Build player attachment counts (safe - won't crash if grids missing)
        buildPlayerAttachmentCounts();

        renderSlots();
        renderWeaponTitle();
        hideAttachmentPicker();
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;

        const overlay = document.getElementById('gunsmith-overlay');
        overlay.classList.add('hidden');
        overlay.classList.remove('gunsmith-fade-in');

        // Show inventory panels again
        const invContainer = document.getElementById('inventory-container');
        if (invContainer) invContainer.style.opacity = '';
        if (invContainer) invContainer.style.pointerEvents = '';

        activeSlot = null;
        hideAttachmentPicker();
    }

    function nuiCallback(name, data) {
        fetch('https://cnbt-inventory/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        }).catch(function () {});
    }

    // ============================================
    // BUILD PLAYER ATTACHMENT COUNTS
    // ============================================

    function buildPlayerAttachmentCounts() {
        playerAttachments = {};
        try {
            if (window.CNBT && window.CNBT.getGrid) {
                var grids = ['player', 'backpack'];
                for (var g = 0; g < grids.length; g++) {
                    var grid = window.CNBT.getGrid(grids[g]);
                    if (!grid || !grid.items) continue;
                    for (var i = 0; i < grid.items.length; i++) {
                        var item = grid.items[i];
                        var def = window.CNBT.getItemDef(item.name);
                        if (def && def.category === 'attachment') {
                            playerAttachments[item.name] = (playerAttachments[item.name] || 0) + (item.count || 1);
                        }
                    }
                }
            }
        } catch (e) {
            // Silently fail - attachment counts will be empty but UI still works
        }
    }

    // ============================================
    // RENDER
    // ============================================

    function renderWeaponTitle() {
        const titleEl = document.getElementById('gunsmith-weapon-title');
        if (titleEl) titleEl.textContent = weaponLabel || weaponName;
    }

    function renderSlots() {
        const container = document.getElementById('gunsmith-slots');
        container.innerHTML = '';

        // Define slot positions around the viewport (like CoD layout)
        const slotPositions = {
            muzzle:     { side: 'left',  row: 0 },
            barrel:     { side: 'left',  row: 1 },
            flashlight: { side: 'left',  row: 2 },
            optic:      { side: 'right', row: 0 },
            grip:       { side: 'right', row: 1 },
            magazine:   { side: 'right', row: 2 },
        };

        const leftSlots = document.createElement('div');
        leftSlots.className = 'gunsmith-slot-column gunsmith-left';

        const rightSlots = document.createElement('div');
        rightSlots.className = 'gunsmith-slot-column gunsmith-right';

        const orderedSlots = ['muzzle', 'barrel', 'flashlight', 'optic', 'grip', 'magazine'];

        for (const slotKey of orderedSlots) {
            if (!slots[slotKey]) continue;

            const slotData = slots[slotKey];
            const pos = slotPositions[slotKey] || { side: 'left', row: 0 };

            const slotEl = document.createElement('div');
            slotEl.className = 'gunsmith-slot';
            if (attachments[slotKey]) {
                slotEl.classList.add('gunsmith-slot-equipped');
            }

            // Slot label
            const labelEl = document.createElement('div');
            labelEl.className = 'gunsmith-slot-label';
            labelEl.textContent = slotData.label || slotKey;
            slotEl.appendChild(labelEl);

            // Equipped attachment name or "Empty"
            const valueEl = document.createElement('div');
            valueEl.className = 'gunsmith-slot-value';
            if (attachments[slotKey]) {
                const attDef = slotData.compatible.find(function (c) { return c.name === attachments[slotKey]; });
                valueEl.textContent = attDef ? attDef.label : attachments[slotKey];
            } else {
                valueEl.textContent = 'Empty';
                valueEl.classList.add('gunsmith-slot-empty');
            }
            slotEl.appendChild(valueEl);

            // Click handler
            slotEl.addEventListener('click', function () {
                selectSlot(slotKey);
            });

            if (pos.side === 'left') {
                leftSlots.appendChild(slotEl);
            } else {
                rightSlots.appendChild(slotEl);
            }
        }

        container.appendChild(leftSlots);
        container.appendChild(rightSlots);
    }

    // ============================================
    // SLOT SELECTION & ATTACHMENT PICKER
    // ============================================

    function selectSlot(slotKey) {
        if (activeSlot === slotKey) {
            // Toggle off
            activeSlot = null;
            hideAttachmentPicker();
            return;
        }

        activeSlot = slotKey;
        showAttachmentPicker(slotKey);

        // Highlight active slot
        const allSlots = document.querySelectorAll('.gunsmith-slot');
        allSlots.forEach(function (el) { el.classList.remove('gunsmith-slot-active'); });
        // Find the slot element
        const slotEls = document.querySelectorAll('.gunsmith-slot');
        const orderedSlots = ['muzzle', 'barrel', 'flashlight', 'optic', 'grip', 'magazine'];
        const visibleSlots = orderedSlots.filter(function (s) { return !!slots[s]; });
        const idx = visibleSlots.indexOf(slotKey);
        if (idx >= 0 && slotEls[idx]) {
            slotEls[idx].classList.add('gunsmith-slot-active');
        }
    }

    function showAttachmentPicker(slotKey) {
        const picker = document.getElementById('gunsmith-picker');
        const pickerList = document.getElementById('gunsmith-picker-list');
        const pickerTitle = document.getElementById('gunsmith-picker-title');
        picker.classList.remove('hidden');

        const slotData = slots[slotKey];
        pickerTitle.textContent = slotData.label || slotKey;
        pickerList.innerHTML = '';

        // If slot has an equipped attachment, show "Remove" option
        if (attachments[slotKey]) {
            const removeEl = document.createElement('div');
            removeEl.className = 'gunsmith-picker-item gunsmith-picker-remove';

            const removeLabel = document.createElement('span');
            removeLabel.className = 'gunsmith-picker-label';
            removeLabel.textContent = 'Remove Attachment';
            removeEl.appendChild(removeLabel);

            removeEl.addEventListener('click', function () {
                detachAttachment(slotKey);
            });
            pickerList.appendChild(removeEl);
        }

        // List compatible attachments
        const compatibles = slotData.compatible || [];
        for (const att of compatibles) {
            const itemEl = document.createElement('div');
            itemEl.className = 'gunsmith-picker-item';

            // Check if player has this attachment
            const hasItem = (playerAttachments[att.name] || 0) > 0;
            const isEquipped = attachments[slotKey] === att.name;

            if (isEquipped) {
                itemEl.classList.add('gunsmith-picker-equipped');
            }
            if (!hasItem && !isEquipped) {
                itemEl.classList.add('gunsmith-picker-unavailable');
            }

            // Image
            const imgEl = document.createElement('img');
            imgEl.className = 'gunsmith-picker-img';
            imgEl.src = 'img/' + att.image;
            imgEl.onerror = function () { this.style.display = 'none'; };
            itemEl.appendChild(imgEl);

            // Info
            const infoEl = document.createElement('div');
            infoEl.className = 'gunsmith-picker-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'gunsmith-picker-name';
            nameEl.textContent = att.label;
            infoEl.appendChild(nameEl);

            const descEl = document.createElement('div');
            descEl.className = 'gunsmith-picker-desc';
            descEl.textContent = att.description || '';
            infoEl.appendChild(descEl);

            if (!isEquipped && hasItem) {
                const countEl = document.createElement('div');
                countEl.className = 'gunsmith-picker-count';
                countEl.textContent = 'In inventory: ' + playerAttachments[att.name];
                infoEl.appendChild(countEl);
            }
            if (isEquipped) {
                const eqTag = document.createElement('div');
                eqTag.className = 'gunsmith-picker-tag';
                eqTag.textContent = 'EQUIPPED';
                infoEl.appendChild(eqTag);
            }

            itemEl.appendChild(infoEl);

            // Click to attach (only if available and not already equipped)
            if (hasItem && !isEquipped) {
                itemEl.addEventListener('click', function () {
                    attachAttachment(slotKey, att.name);
                });
            }

            pickerList.appendChild(itemEl);
        }

        if (compatibles.length === 0 && !attachments[slotKey]) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'gunsmith-picker-empty';
            emptyEl.textContent = 'No compatible attachments';
            pickerList.appendChild(emptyEl);
        }
    }

    function hideAttachmentPicker() {
        const picker = document.getElementById('gunsmith-picker');
        picker.classList.add('hidden');
        activeSlot = null;

        const allSlots = document.querySelectorAll('.gunsmith-slot');
        allSlots.forEach(function (el) { el.classList.remove('gunsmith-slot-active'); });
    }

    // ============================================
    // ATTACH / DETACH ACTIONS
    // ============================================

    function attachAttachment(slotKey, attachmentName) {
        nuiCallback('gunsmithAttach', {
            weaponName: weaponName,
            weaponItemIndex: weaponItemIndex,
            weaponGrid: weaponGrid,
            slot: slotKey,
            attachmentName: attachmentName,
        });
    }

    function detachAttachment(slotKey) {
        nuiCallback('gunsmithDetach', {
            weaponName: weaponName,
            weaponItemIndex: weaponItemIndex,
            weaponGrid: weaponGrid,
            slot: slotKey,
        });
    }

    // ============================================
    // SERVER RESPONSE HANDLERS
    // ============================================

    function handleAttachSuccess(msg) {
        attachments = msg.updatedAttachments || {};
        // Update local player attachment counts
        if (playerAttachments[msg.attachmentName]) {
            playerAttachments[msg.attachmentName]--;
            if (playerAttachments[msg.attachmentName] <= 0) {
                delete playerAttachments[msg.attachmentName];
            }
        }

        // Re-render
        renderSlots();
        if (activeSlot) {
            showAttachmentPicker(activeSlot);
            selectSlot(activeSlot);
        }

        // Update the player grid if CNBT is available
        if (msg.updatedItems && window.CNBT && typeof window.CNBT.reloadPlayerItems === 'function') {
            window.CNBT.reloadPlayerItems(msg.updatedItems);
        }
    }

    function handleDetachSuccess(msg) {
        attachments = msg.updatedAttachments || {};
        // Update local player attachment counts
        playerAttachments[msg.attachmentName] = (playerAttachments[msg.attachmentName] || 0) + 1;

        // Re-render
        renderSlots();
        if (activeSlot) {
            showAttachmentPicker(activeSlot);
            selectSlot(activeSlot);
        }

        // Update the player grid if CNBT is available
        if (msg.updatedItems && window.CNBT && typeof window.CNBT.reloadPlayerItems === 'function') {
            window.CNBT.reloadPlayerItems(msg.updatedItems);
        }
    }

    // ============================================
    // MOUSE DRAG ROTATION
    // ============================================

    function initDragRotation() {
        const viewport = document.getElementById('gunsmith-viewport');

        viewport.addEventListener('pointerdown', function (e) {
            if (!isOpen) return;
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            viewport.setPointerCapture(e.pointerId);
            viewport.style.cursor = 'grabbing';
        });

        viewport.addEventListener('pointermove', function (e) {
            if (!isOpen || !isDragging) return;

            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            // Send rotation delta to Lua
            nuiCallback('gunsmithRotate', { dx: dx, dy: dy });
        });

        viewport.addEventListener('pointerup', function (e) {
            isDragging = false;
            viewport.style.cursor = 'grab';
        });

        viewport.addEventListener('pointercancel', function () {
            isDragging = false;
            viewport.style.cursor = 'grab';
        });
    }

    // ============================================
    // CLOSE BUTTON & ESC
    // ============================================

    function initCloseHandlers() {
        const closeBtn = document.getElementById('gunsmith-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                nuiCallback('closeGunsmith', {});
            });
        }
    }

    // ============================================
    // INIT
    // ============================================

    function init() {
        initDragRotation();
        initCloseHandlers();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        handleMessage: handleMessage,
        isOpen: function () { return isOpen; },
        close: close,
    };
})();
