/**
 * CNBT Inventory - Gunsmith Panel (COD-style fullscreen)
 *
 *  - Full-screen overlay with a blurred background ring (backdrop-filter +
 *    radial mask) leaving a clear "hole" centered on the weapon.
 *  - The native GTA V weapon model is rendered by the game in front of the
 *    gameplay camera (see client/gunsmith.lua). The player's camera is never
 *    touched - the blur hides the game world behind the weapon.
 *  - Attachment slots appear as circular "+" buttons with label pills, floating
 *    around the weapon at fixed positions (like Call of Duty MW gunsmith).
 *  - Mouse drag on the viewport rotates the weapon.
 *  - Drag attachments from inventory onto slots (slots glow green/red).
 *  - Right-click a filled slot to remove the attachment.
 */

'use strict';

window.Gunsmith = (function () {
    // State
    var isOpenState = false;
    var weaponName = null;
    var weaponLabel = '';
    var weaponCategory = '';
    var weaponItemIndex = null;
    var weaponGrid = null;
    var slots = {};
    var attachments = {};

    // Viewport rotation drag state
    var isRotatingWeapon = false;
    var lastRotX = 0;
    var lastRotY = 0;

    // Fixed on-screen positions for each attachment slot (as % of the viewport).
    // Layout inspired by the Call of Duty MW gunsmith reference screenshot.
    var SLOT_POSITIONS = {
        barrel:     { left: '24%', top: '30%' },
        flashlight: { left: '46%', top: '22%' },
        optic:      { left: '74%', top: '30%' },
        muzzle:     { left: '22%', top: '72%' },
        magazine:   { left: '50%', top: '80%' },
        grip:       { left: '76%', top: '72%' },
    };
    var SLOT_ORDER = ['muzzle', 'barrel', 'optic', 'flashlight', 'grip', 'magazine'];

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
        weaponLabel = msg.weaponLabel || msg.weaponName || '';
        weaponCategory = msg.weaponCategory || 'WEAPON';
        weaponItemIndex = msg.itemIndex;
        weaponGrid = msg.gridId;
        slots = msg.slots || {};
        attachments = msg.attachments || {};

        isOpenState = true;

        var overlay = document.getElementById('gunsmith-overlay');
        overlay.classList.remove('hidden');

        var titleEl = document.getElementById('gunsmith-title');
        titleEl.textContent = weaponLabel.toUpperCase();

        var catEl = document.getElementById('gunsmith-category');
        catEl.textContent = (weaponCategory || 'WEAPON').toUpperCase();

        renderSlots();
    }

    function close() {
        if (!isOpenState) return;
        isOpenState = false;

        var overlay = document.getElementById('gunsmith-overlay');
        overlay.classList.add('hidden');

        clearSlotHighlights();
    }

    function nuiCallback(name, data) {
        fetch('https://cnbt-inventory/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        }).catch(function () {});
    }

    // ============================================
    // RENDER SLOTS
    // ============================================

    function renderSlots() {
        var container = document.getElementById('gunsmith-slot-list');
        container.innerHTML = '';

        for (var s = 0; s < SLOT_ORDER.length; s++) {
            var key = SLOT_ORDER[s];
            if (!slots[key]) continue;

            var slotData = slots[key];
            var pos = SLOT_POSITIONS[key] || { left: '50%', top: '50%' };

            var slotEl = document.createElement('div');
            slotEl.className = 'gs-slot';
            slotEl.dataset.slot = key;
            slotEl.style.left = pos.left;
            slotEl.style.top = pos.top;

            // Circular icon ("+" when empty, attachment image when equipped)
            var iconEl = document.createElement('div');
            iconEl.className = 'gs-slot-icon';

            var equipped = attachments[key] || null;
            if (equipped) {
                slotEl.classList.add('gs-slot-filled');
                var attDef = window.CNBT ? window.CNBT.getItemDef(equipped) : null;
                if (attDef && attDef.image) {
                    var attImg = document.createElement('img');
                    attImg.src = 'img/' + attDef.image;
                    attImg.onerror = function () {
                        this.style.display = 'none';
                        var plus = document.createElement('span');
                        plus.className = 'gs-slot-plus';
                        plus.textContent = '+';
                        iconEl.appendChild(plus);
                    };
                    iconEl.appendChild(attImg);
                } else {
                    var plusEl = document.createElement('span');
                    plusEl.className = 'gs-slot-plus';
                    plusEl.textContent = '+';
                    iconEl.appendChild(plusEl);
                }
            } else {
                var plusEmpty = document.createElement('span');
                plusEmpty.className = 'gs-slot-plus';
                plusEmpty.textContent = '+';
                iconEl.appendChild(plusEmpty);
            }

            slotEl.appendChild(iconEl);

            // Label pill
            var label = document.createElement('div');
            label.className = 'gs-slot-label';
            label.textContent = slotData.label || key;
            slotEl.appendChild(label);

            // Right-click to remove attachment
            (function (slotKey, hasEquipped) {
                if (hasEquipped) {
                    slotEl.addEventListener('contextmenu', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        detachFromSlot(slotKey);
                    });
                }
            })(key, !!equipped);

            container.appendChild(slotEl);
        }
    }

    // ============================================
    // DRAG-DROP: SLOT INTERACTION
    // ============================================

    /**
     * Called by DragSystem when a drag starts with an attachment item.
     * Immediately highlights all slots: green if compatible, red if not.
     */
    function highlightAllSlots(dragItemName) {
        if (!isOpenState) return;
        var slotEls = document.querySelectorAll('.gs-slot');
        for (var i = 0; i < slotEls.length; i++) {
            var el = slotEls[i];
            var slotKey = el.dataset.slot;
            var slotData = slots[slotKey];
            if (!slotData) continue;

            if (attachments[slotKey]) {
                el.classList.add('gs-slot-incompat');
                continue;
            }

            var isCompat = slotData.compatible && slotData.compatible[dragItemName] === true;
            el.classList.add(isCompat ? 'gs-slot-compat' : 'gs-slot-incompat');
        }
    }

    function getHoveredSlot(px, py, dragItemName) {
        if (!isOpenState) return null;

        var slotEls = document.querySelectorAll('.gs-slot');
        for (var i = 0; i < slotEls.length; i++) {
            var el = slotEls[i];
            var rect = el.getBoundingClientRect();
            if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) {
                var slotKey = el.dataset.slot;
                var slotData = slots[slotKey];
                if (!slotData) continue;

                if (attachments[slotKey]) {
                    return { element: el, slot: slotKey, compatible: false, reason: 'occupied' };
                }

                var isCompat = slotData.compatible && slotData.compatible[dragItemName] === true;
                return { element: el, slot: slotKey, compatible: isCompat };
            }
        }
        return null;
    }

    function handleSlotDrop(slotKey, dragItemName) {
        nuiCallback('gunsmithAttach', {
            weaponName: weaponName,
            weaponItemIndex: weaponItemIndex,
            weaponGrid: weaponGrid,
            slot: slotKey,
            attachmentName: dragItemName,
        });
    }

    function detachFromSlot(slotKey) {
        nuiCallback('gunsmithDetach', {
            weaponName: weaponName,
            weaponItemIndex: weaponItemIndex,
            weaponGrid: weaponGrid,
            slot: slotKey,
        });
    }

    function clearSlotHighlights() {
        var slotEls = document.querySelectorAll('.gs-slot');
        for (var i = 0; i < slotEls.length; i++) {
            slotEls[i].classList.remove('gs-slot-compat', 'gs-slot-incompat', 'gs-slot-hover');
        }
    }

    function highlightSlot(element) {
        element.classList.add('gs-slot-hover');
    }

    // ============================================
    // SERVER RESPONSES
    // ============================================

    function handleAttachSuccess(msg) {
        attachments = msg.updatedAttachments || {};
        renderSlots();
        if (msg.updatedItems && window.CNBT && window.CNBT.reloadPlayerItems) {
            window.CNBT.reloadPlayerItems(msg.updatedItems);
        }
    }

    function handleDetachSuccess(msg) {
        attachments = msg.updatedAttachments || {};
        renderSlots();
        if (msg.updatedItems && window.CNBT && window.CNBT.reloadPlayerItems) {
            window.CNBT.reloadPlayerItems(msg.updatedItems);
        }
    }

    // ============================================
    // VIEWPORT ROTATION (mouse drag -> rotate in-game weapon)
    // ============================================

    function initViewportRotation() {
        var viewport = document.getElementById('gunsmith-3d-viewport');
        if (!viewport) return;

        viewport.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            // Don't start rotation if an inventory drag is in progress
            if (window.DragSystem && window.DragSystem.isActive && window.DragSystem.isActive()) return;
            e.preventDefault();
            e.stopPropagation();
            isRotatingWeapon = true;
            lastRotX = e.clientX;
            lastRotY = e.clientY;
            try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
            viewport.classList.add('dragging');
            nuiCallback('gunsmithDragStart', {});
        });

        viewport.addEventListener('pointermove', function (e) {
            if (!isRotatingWeapon) return;
            var dx = e.clientX - lastRotX;
            var dy = e.clientY - lastRotY;
            lastRotX = e.clientX;
            lastRotY = e.clientY;
            if (dx !== 0 || dy !== 0) {
                nuiCallback('gunsmithRotate', { dx: dx, dy: dy });
            }
        });

        function endRotation(e) {
            if (!isRotatingWeapon) return;
            isRotatingWeapon = false;
            viewport.classList.remove('dragging');
            try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
            nuiCallback('gunsmithDragEnd', {});
        }

        viewport.addEventListener('pointerup', endRotation);
        viewport.addEventListener('pointercancel', endRotation);
    }

    // ============================================
    // INIT
    // ============================================

    function init() {
        initViewportRotation();

        var btn = document.getElementById('gunsmith-back-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                nuiCallback('closeGunsmith', {});
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        handleMessage: handleMessage,
        isOpen: function () { return isOpenState; },
        close: close,
        getHoveredSlot: getHoveredSlot,
        handleSlotDrop: handleSlotDrop,
        clearSlotHighlights: clearSlotHighlights,
        highlightSlot: highlightSlot,
        highlightAllSlots: highlightAllSlots,
    };
})();
