/**
 * CNBT Inventory - Gunsmith Panel
 *
 * Opens as a panel inside the inventory. Shows weapon image
 * with attachment slots below. Drag attachments from inventory
 * onto slots: green = compatible, red = incompatible.
 * Right-click a filled slot to remove the attachment.
 */

'use strict';

window.Gunsmith = (function () {
    // State
    var isOpenState = false;
    var weaponName = null;
    var weaponLabel = '';
    var weaponItemIndex = null;
    var weaponGrid = null;
    var slots = {};        // { slotKey: { label, equipped, equippedLabel, equippedImage, compatible:{name:true} } }
    var attachments = {};  // { slotKey: attachmentItemName }

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

        var panel = document.getElementById('gunsmith-panel');
        panel.classList.remove('hidden');

        render();
    }

    function close() {
        if (!isOpenState) return;
        isOpenState = false;

        var panel = document.getElementById('gunsmith-panel');
        panel.classList.add('hidden');
    }

    function nuiCallback(name, data) {
        fetch('https://cnbt-inventory/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        }).catch(function () {});
    }

    // ============================================
    // RENDER
    // ============================================

    function render() {
        // Title
        var titleEl = document.getElementById('gunsmith-title');
        titleEl.textContent = weaponLabel || weaponName || '';

        // Weapon image
        var imgEl = document.getElementById('gunsmith-weapon-img');
        var imgDefs = window.CNBT ? window.CNBT.getItemDef(weaponName) : null;
        if (imgDefs && imgDefs.image) {
            imgEl.src = 'img/' + imgDefs.image;
            imgEl.style.display = '';
        } else {
            imgEl.style.display = 'none';
        }

        // Slots
        renderSlots();
    }

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
                // Show attachment image
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

            // Right-click to remove equipped attachment
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
    // DRAG DROP INTEGRATION
    // ============================================

    /**
     * Called by DragSystem during drag to check if mouse is over a gunsmith slot.
     * Returns { slot, compatible } or null
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

                // Already has attachment?
                if (attachments[slotKey]) {
                    return { element: el, slot: slotKey, compatible: false, reason: 'occupied' };
                }

                // Check compatibility
                var isCompat = slotData.compatible && slotData.compatible[dragItemName] === true;
                return { element: el, slot: slotKey, compatible: isCompat };
            }
        }
        return null;
    }

    /**
     * Called by DragSystem when an item is dropped on a gunsmith slot
     */
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

    // ============================================
    // HIGHLIGHT (called by DragSystem during drag)
    // ============================================

    function clearSlotHighlights() {
        var slotEls = document.querySelectorAll('.gs-slot');
        for (var i = 0; i < slotEls.length; i++) {
            slotEls[i].classList.remove('gs-slot-compat', 'gs-slot-incompat');
        }
    }

    function highlightSlot(element, compatible) {
        element.classList.remove('gs-slot-compat', 'gs-slot-incompat');
        element.classList.add(compatible ? 'gs-slot-compat' : 'gs-slot-incompat');
    }

    // ============================================
    // SERVER RESPONSES
    // ============================================

    function handleAttachSuccess(msg) {
        attachments = msg.updatedAttachments || {};
        renderSlots();

        // Reload player grid items (attachment removed from inv)
        if (msg.updatedItems && window.CNBT && window.CNBT.reloadPlayerItems) {
            window.CNBT.reloadPlayerItems(msg.updatedItems);
        }
    }

    function handleDetachSuccess(msg) {
        attachments = msg.updatedAttachments || {};
        renderSlots();

        // Reload player grid items (attachment added back to inv)
        if (msg.updatedItems && window.CNBT && window.CNBT.reloadPlayerItems) {
            window.CNBT.reloadPlayerItems(msg.updatedItems);
        }
    }

    // ============================================
    // INIT
    // ============================================

    function initCloseBtn() {
        var btn = document.getElementById('gunsmith-back-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                nuiCallback('closeGunsmith', {});
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCloseBtn);
    } else {
        initCloseBtn();
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
    };
})();
