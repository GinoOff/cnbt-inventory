/**
 * CNBT Inventory - Gunsmith Panel
 *
 * Floating draggable window with:
 *  - Transparent viewport (in-game weapon model renders behind it via scripted camera)
 *  - Attachment slots that glow green/red as soon as drag starts
 *  - Drag attachments from inventory onto slots
 *  - Right-click filled slot to remove
 */

'use strict';

window.Gunsmith = (function () {
    // State
    var isOpenState = false;
    var weaponName = null;
    var weaponLabel = '';
    var weaponItemIndex = null;
    var weaponGrid = null;
    var slots = {};
    var attachments = {};

    // Draggable window state
    var isDraggingWindow = false;
    var dragOffsetX = 0;
    var dragOffsetY = 0;

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

        isOpenState = true;

        var win = document.getElementById('gunsmith-window');
        win.classList.remove('hidden');

        // Center window on first open
        if (!win.dataset.positioned) {
            var ww = window.innerWidth;
            var wh = window.innerHeight;
            win.style.left = Math.max(20, (ww / 2 - 260)) + 'px';
            win.style.top = Math.max(20, (wh / 2 - 250)) + 'px';
            win.dataset.positioned = '1';
        }

        // Title
        var titleEl = document.getElementById('gunsmith-title');
        titleEl.textContent = weaponLabel || weaponName || '';

        renderSlots();
    }

    function close() {
        if (!isOpenState) return;
        isOpenState = false;

        var win = document.getElementById('gunsmith-window');
        win.classList.add('hidden');

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

        var slotOrder = ['muzzle', 'barrel', 'optic', 'flashlight', 'grip', 'magazine'];

        for (var s = 0; s < slotOrder.length; s++) {
            var key = slotOrder[s];
            if (!slots[key]) continue;

            var slotData = slots[key];
            var slotEl = document.createElement('div');
            slotEl.className = 'gs-slot';
            slotEl.dataset.slot = key;

            var equipped = attachments[key] || null;

            if (equipped) {
                slotEl.classList.add('gs-slot-filled');
                var attDef = window.CNBT ? window.CNBT.getItemDef(equipped) : null;
                if (attDef && attDef.image) {
                    var attImg = document.createElement('img');
                    attImg.className = 'gs-slot-img';
                    attImg.src = 'img/' + attDef.image;
                    attImg.onerror = function () { this.style.display = 'none'; };
                    slotEl.appendChild(attImg);
                }
                var attLabel = document.createElement('div');
                attLabel.className = 'gs-slot-att-name';
                attLabel.textContent = attDef ? attDef.label : equipped;
                slotEl.appendChild(attLabel);
            } else {
                var emptyIcon = document.createElement('div');
                emptyIcon.className = 'gs-slot-empty-icon';
                emptyIcon.textContent = '+';
                slotEl.appendChild(emptyIcon);
            }

            var label = document.createElement('div');
            label.className = 'gs-slot-label';
            label.textContent = slotData.label;
            slotEl.appendChild(label);

            // Right-click to remove
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
     * Called by DragSystem when drag STARTS with an attachment item.
     * Immediately highlights ALL slots: green if compatible, red if not.
     */
    function highlightAllSlots(dragItemName) {
        if (!isOpenState) return;
        var slotEls = document.querySelectorAll('.gs-slot');
        for (var i = 0; i < slotEls.length; i++) {
            var el = slotEls[i];
            var slotKey = el.dataset.slot;
            var slotData = slots[slotKey];
            if (!slotData) continue;

            // Already equipped = red
            if (attachments[slotKey]) {
                el.classList.add('gs-slot-incompat');
                continue;
            }

            // Compatible check
            var isCompat = slotData.compatible && slotData.compatible[dragItemName] === true;
            el.classList.add(isCompat ? 'gs-slot-compat' : 'gs-slot-incompat');
        }
    }

    /**
     * Called by DragSystem during hover to check a specific slot.
     */
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

    /** Adds an extra "hover" emphasis on a specific slot during drag */
    function highlightSlot(element, compatible) {
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
    // DRAGGABLE WINDOW
    // ============================================

    function initDraggableWindow() {
        var titlebar = document.getElementById('gunsmith-titlebar');
        var win = document.getElementById('gunsmith-window');
        if (!titlebar || !win) return;

        titlebar.addEventListener('pointerdown', function (e) {
            if (e.target.closest('.gs-close-btn')) return;
            e.preventDefault();
            isDraggingWindow = true;
            var rect = win.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            titlebar.setPointerCapture(e.pointerId);
            titlebar.style.cursor = 'grabbing';
        });

        titlebar.addEventListener('pointermove', function (e) {
            if (!isDraggingWindow) return;
            var x = e.clientX - dragOffsetX;
            var y = e.clientY - dragOffsetY;
            x = Math.max(0, Math.min(x, window.innerWidth - 100));
            y = Math.max(0, Math.min(y, window.innerHeight - 50));
            win.style.left = x + 'px';
            win.style.top = y + 'px';
        });

        titlebar.addEventListener('pointerup', function () {
            isDraggingWindow = false;
            titlebar.style.cursor = 'grab';
        });

        titlebar.addEventListener('pointercancel', function () {
            isDraggingWindow = false;
            titlebar.style.cursor = 'grab';
        });
    }

    // ============================================
    // INIT
    // ============================================

    function init() {
        initDraggableWindow();

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
