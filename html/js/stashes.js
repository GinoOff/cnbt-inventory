/**
 * cnbt-inventory - Stash Manager NUI
 *
 * Staff-only overlay opened by the /depositi command. Shows the list of
 * persistent stashes and provides a form to create a new one. Creating a
 * stash doesn't POST straight to the server - instead it closes NUI focus
 * and kicks off the in-game placement editor (see client/stashes.lua) with
 * the form payload. The placement editor commits back to the server once
 * the staffer confirms the position.
 */

'use strict';

(function () {
    const root = document.getElementById('stash-manager');
    const listEl = document.getElementById('sm-list');
    const formEl = document.getElementById('sm-form');

    const inId     = document.getElementById('sm-in-id');
    const inLabel  = document.getElementById('sm-in-label');
    const inCols   = document.getElementById('sm-in-cols');
    const inRows   = document.getElementById('sm-in-rows');
    const inWeight = document.getElementById('sm-in-weight');
    const inProp   = document.getElementById('sm-in-prop');

    const btnClose        = document.getElementById('sm-close');
    const btnCreate       = document.getElementById('sm-create-btn');
    const btnCancelCreate = document.getElementById('sm-cancel-create');
    const btnSubmit       = document.getElementById('sm-submit-create');

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

    function openManager(stashes) {
        root.classList.remove('hidden');
        hideCreateForm();
        renderList(stashes || []);
    }

    function closeManager() {
        root.classList.add('hidden');
        hideCreateForm();
    }

    // ----------------------------------------------------------
    // List rendering
    // ----------------------------------------------------------
    function renderList(stashes) {
        listEl.innerHTML = '';

        if (!stashes.length) {
            const empty = document.createElement('div');
            empty.className = 'sm-empty';
            empty.textContent = 'Nessun deposito configurato.';
            listEl.appendChild(empty);
            return;
        }

        for (const s of stashes) {
            const row = document.createElement('div');
            row.className = 'sm-row';

            const info = document.createElement('div');
            info.className = 'sm-row-info';

            const title = document.createElement('div');
            title.className = 'sm-row-title';
            title.textContent = s.label || s.id;
            info.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'sm-row-meta';
            const pos = s.position || { x: 0, y: 0, z: 0 };
            meta.textContent =
                s.id + '  //  ' +
                s.cols + 'x' + s.rows + '  //  ' +
                (s.maxWeight / 1000).toFixed(1) + ' kg  //  ' +
                (s.propModel || '—') +
                '  //  (' + pos.x.toFixed(1) + ', ' + pos.y.toFixed(1) + ', ' + pos.z.toFixed(1) + ')';
            info.appendChild(meta);

            row.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'sm-row-actions';

            const delBtn = document.createElement('button');
            delBtn.className = 'sm-action-btn sm-btn-danger';
            delBtn.textContent = 'Elimina';
            delBtn.addEventListener('click', function () {
                if (delBtn.dataset.confirming === '1') {
                    // Second click: actually delete
                    cb('deleteStash', { id: s.id });
                    row.remove();
                    if (!listEl.children.length) renderList([]);
                } else {
                    // First click: ask for confirmation (resets after 3s)
                    delBtn.dataset.confirming = '1';
                    delBtn.textContent = 'Conferma?';
                    delBtn._resetTimer = setTimeout(function () {
                        if (delBtn.parentNode) {
                            delBtn.dataset.confirming = '';
                            delBtn.textContent = 'Elimina';
                        }
                    }, 3000);
                }
            });
            actions.appendChild(delBtn);

            row.appendChild(actions);
            listEl.appendChild(row);
        }
    }

    // ----------------------------------------------------------
    // Create form
    // ----------------------------------------------------------
    function showCreateForm() {
        formEl.classList.remove('hidden');
        inId.value = '';
        inLabel.value = '';
        inCols.value = 6;
        inRows.value = 6;
        inWeight.value = 50000;
        inProp.value = '';
        setTimeout(function () { inId.focus(); }, 30);
    }

    function hideCreateForm() {
        formEl.classList.add('hidden');
    }

    function submitCreate() {
        const id = (inId.value || '').trim().toLowerCase().replace(/[^\w\-]/g, '');
        const label = (inLabel.value || '').trim();
        const cols = parseInt(inCols.value, 10);
        const rows = parseInt(inRows.value, 10);
        const maxWeight = parseInt(inWeight.value, 10);
        const propModel = (inProp.value || '').trim();

        if (!id) { inId.focus(); return; }
        if (!label) { inLabel.focus(); return; }
        if (!propModel) { inProp.focus(); return; }
        if (!cols || cols < 1) { inCols.focus(); return; }
        if (!rows || rows < 1) { inRows.focus(); return; }
        if (!maxWeight || maxWeight < 1) { inWeight.focus(); return; }

        // Hand off to the in-game placement editor. The client-side Lua will
        // call back with cnbt-inventory:stashes:create when the staffer
        // confirms position + rotation.
        cb('startStashPlacement', {
            id: id,
            label: label,
            cols: cols,
            rows: rows,
            maxWeight: maxWeight,
            propModel: propModel,
        });
    }

    // ----------------------------------------------------------
    // Event wiring
    // ----------------------------------------------------------
    btnClose.addEventListener('click', function () {
        closeManager();
        cb('closeStashManager');
    });

    btnCreate.addEventListener('click', showCreateForm);
    btnCancelCreate.addEventListener('click', hideCreateForm);
    btnSubmit.addEventListener('click', submitCreate);

    // Global keyboard: ESC closes the manager
    document.addEventListener('keyup', function (e) {
        if (e.key === 'Escape' && !root.classList.contains('hidden')) {
            closeManager();
            cb('closeStashManager');
        }
    });

    // ----------------------------------------------------------
    // Listen for Lua messages
    // ----------------------------------------------------------
    window.addEventListener('message', function (event) {
        const msg = event.data;
        if (!msg || !msg.type) return;

        if (msg.type === 'openStashManager') {
            openManager(msg.stashes);
        } else if (msg.type === 'closeStashManager') {
            closeManager();
        }
    });
})();
