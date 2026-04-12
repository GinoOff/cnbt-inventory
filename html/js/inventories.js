/**
 * cnbt-inventory - Inventory Manager NUI
 *
 * Staff-only overlay opened by /inventari. Lists all player inventories,
 * lets staff inspect item contents and delete individual items or clear
 * entire inventories.
 */

'use strict';

(function () {
    var root = document.getElementById('inventory-manager');
    var listEl = document.getElementById('im-list');
    var detailEl = document.getElementById('im-detail');
    var detailTitle = document.getElementById('im-detail-title');
    var detailBody = document.getElementById('im-detail-body');
    var searchInput = document.getElementById('im-search');
    var btnClose = document.getElementById('im-close');
    var btnClear = document.getElementById('im-clear-btn');

    var allInventories = [];
    var currentOwner = null;
    var currentInvType = null;

    // ----------------------------------------------------------
    // NUI helpers
    // ----------------------------------------------------------
    function cb(name, data) {
        fetch('https://cnbt-inventory/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        }).catch(function () {});
    }

    function openManager(inventories) {
        allInventories = inventories || [];
        root.classList.remove('hidden');
        hideDetail();
        renderList(allInventories);
        if (searchInput) searchInput.value = '';
    }

    function closeManager() {
        root.classList.add('hidden');
        hideDetail();
        allInventories = [];
        currentOwner = null;
        currentInvType = null;
    }

    // ----------------------------------------------------------
    // List rendering
    // ----------------------------------------------------------
    function renderList(inventories) {
        listEl.innerHTML = '';

        if (!inventories.length) {
            var empty = document.createElement('div');
            empty.className = 'im-empty';
            empty.textContent = 'Nessun inventario trovato.';
            listEl.appendChild(empty);
            return;
        }

        for (var i = 0; i < inventories.length; i++) {
            var inv = inventories[i];
            var row = document.createElement('div');
            row.className = 'im-row';

            var info = document.createElement('div');
            info.className = 'im-row-info';

            var title = document.createElement('div');
            title.className = 'im-row-title';
            title.textContent = inv.owner;
            info.appendChild(title);

            var meta = document.createElement('div');
            meta.className = 'im-row-meta';
            meta.textContent =
                inv.invType +
                '  //  ' + inv.itemCount + ' items' +
                '  //  ' + (inv.totalWeight / 1000).toFixed(1) + ' kg' +
                (inv.hasBackpack ? '  //  Zaino' : '');
            info.appendChild(meta);

            row.appendChild(info);

            var actions = document.createElement('div');
            actions.className = 'im-row-actions';

            // View button
            var viewBtn = document.createElement('button');
            viewBtn.className = 'im-action-btn im-btn-primary';
            viewBtn.textContent = 'Vedi';
            viewBtn.dataset.owner = inv.owner;
            viewBtn.dataset.invType = inv.invType;
            viewBtn.addEventListener('click', function () {
                var o = this.dataset.owner;
                var t = this.dataset.invType;
                currentOwner = o;
                currentInvType = t;
                cb('viewInventoryDetail', { owner: o, invType: t });
            });
            actions.appendChild(viewBtn);

            row.appendChild(actions);
            listEl.appendChild(row);
        }
    }

    // ----------------------------------------------------------
    // Detail view
    // ----------------------------------------------------------
    function showDetail(detail) {
        detailEl.classList.remove('hidden');
        detailTitle.textContent = detail.owner + ' (' + detail.invType + ')';
        currentOwner = detail.owner;
        currentInvType = detail.invType;

        detailBody.innerHTML = '';

        if (!detail.items || !detail.items.length) {
            var empty = document.createElement('div');
            empty.className = 'im-empty';
            empty.textContent = 'Inventario vuoto.';
            detailBody.appendChild(empty);

            // Backpack section
            if (detail.backpack && detail.backpack.items && detail.backpack.items.length) {
                renderBackpackSection(detail);
            }
            return;
        }

        // Section header
        var sectionHeader = document.createElement('div');
        sectionHeader.className = 'im-section-header';
        sectionHeader.textContent = 'INVENTARIO PRINCIPALE';
        detailBody.appendChild(sectionHeader);

        renderItemList(detail.items, 'main', detail.owner, detail.invType);

        // Backpack section
        if (detail.backpack && detail.backpack.items && detail.backpack.items.length) {
            renderBackpackSection(detail);
        }
    }

    function renderBackpackSection(detail) {
        var bpHeader = document.createElement('div');
        bpHeader.className = 'im-section-header';
        bpHeader.textContent = 'ZAINO (' + (detail.backpack.label || detail.backpack.name) + ')';
        detailBody.appendChild(bpHeader);

        renderItemList(detail.backpack.items, 'backpack', detail.owner, detail.invType);
    }

    function renderItemList(items, grid, owner, invType) {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var itemRow = document.createElement('div');
            itemRow.className = 'im-item-row';

            // Image
            var imgWrap = document.createElement('div');
            imgWrap.className = 'im-item-img-wrap';
            if (item.image) {
                var img = document.createElement('img');
                img.src = 'img/' + item.image;
                img.className = 'im-item-img';
                img.onerror = function () { this.style.display = 'none'; };
                imgWrap.appendChild(img);
            }
            itemRow.appendChild(imgWrap);

            // Info
            var itemInfo = document.createElement('div');
            itemInfo.className = 'im-item-info';

            var itemLabel = document.createElement('div');
            itemLabel.className = 'im-item-label';
            itemLabel.textContent = item.label;
            itemInfo.appendChild(itemLabel);

            var itemMeta = document.createElement('div');
            itemMeta.className = 'im-item-meta';
            itemMeta.textContent =
                item.name + '  x' + item.count +
                '  //  ' + ((item.weight * item.count) / 1000).toFixed(1) + ' kg';
            itemInfo.appendChild(itemMeta);

            itemRow.appendChild(itemInfo);

            // Delete button
            var delBtn = document.createElement('button');
            delBtn.className = 'im-action-btn im-btn-danger im-btn-small';
            delBtn.textContent = 'Elimina';
            delBtn.dataset.index = item.index;
            delBtn.dataset.grid = grid;
            delBtn.addEventListener('click', function () {
                var btn = this;
                if (btn.dataset.confirming === '1') {
                    cb('deleteInventoryItem', {
                        owner: owner,
                        invType: invType,
                        itemIndex: parseInt(btn.dataset.index),
                        grid: btn.dataset.grid,
                    });
                    // Remove row visually
                    var row = btn.closest('.im-item-row');
                    if (row) row.remove();
                } else {
                    btn.dataset.confirming = '1';
                    btn.textContent = 'Conferma?';
                    setTimeout(function () {
                        if (btn.parentNode) {
                            btn.dataset.confirming = '';
                            btn.textContent = 'Elimina';
                        }
                    }, 3000);
                }
            });
            itemRow.appendChild(delBtn);

            detailBody.appendChild(itemRow);
        }
    }

    function hideDetail() {
        detailEl.classList.add('hidden');
        detailBody.innerHTML = '';
    }

    // ----------------------------------------------------------
    // Search / filter
    // ----------------------------------------------------------
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var query = this.value.toLowerCase().trim();
            if (!query) {
                renderList(allInventories);
                return;
            }
            var filtered = allInventories.filter(function (inv) {
                return inv.owner.toLowerCase().indexOf(query) !== -1 ||
                       inv.invType.toLowerCase().indexOf(query) !== -1;
            });
            renderList(filtered);
        });
    }

    // ----------------------------------------------------------
    // Clear inventory button
    // ----------------------------------------------------------
    if (btnClear) {
        btnClear.addEventListener('click', function () {
            if (!currentOwner || !currentInvType) return;
            if (btnClear.dataset.confirming === '1') {
                cb('clearInventory', {
                    owner: currentOwner,
                    invType: currentInvType,
                });
                detailBody.innerHTML = '';
                var empty = document.createElement('div');
                empty.className = 'im-empty';
                empty.textContent = 'Inventario svuotato.';
                detailBody.appendChild(empty);
                btnClear.dataset.confirming = '';
                btnClear.textContent = 'Svuota Inventario';
            } else {
                btnClear.dataset.confirming = '1';
                btnClear.textContent = 'Conferma svuota?';
                setTimeout(function () {
                    if (btnClear.parentNode) {
                        btnClear.dataset.confirming = '';
                        btnClear.textContent = 'Svuota Inventario';
                    }
                }, 3000);
            }
        });
    }

    // ----------------------------------------------------------
    // Event wiring
    // ----------------------------------------------------------
    if (btnClose) {
        btnClose.addEventListener('click', function () {
            closeManager();
            cb('closeInventoryManager');
        });
    }

    // ESC closes
    document.addEventListener('keyup', function (e) {
        if (e.key === 'Escape' && !root.classList.contains('hidden')) {
            closeManager();
            cb('closeInventoryManager');
        }
    });

    // ----------------------------------------------------------
    // Listen for Lua messages
    // ----------------------------------------------------------
    window.addEventListener('message', function (event) {
        var msg = event.data;
        if (!msg || !msg.type) return;

        if (msg.type === 'openInventoryManager') {
            openManager(msg.inventories);
        } else if (msg.type === 'closeInventoryManager') {
            closeManager();
        } else if (msg.type === 'inventoryDetail') {
            showDetail(msg.detail);
        } else if (msg.type === 'inventoryDeleteItemSuccess') {
            // Item already removed visually on click
        } else if (msg.type === 'inventoryClearSuccess') {
            // Already handled visually
        }
    });
})();
