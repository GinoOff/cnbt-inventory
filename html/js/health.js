/**
 * CNBT Inventory - Health Panel (scheda Salute del pannello Utilità)
 *
 * Stickman medico interattivo: mostra fratture, emorragie, danni agli
 * organi e abrasioni per zona; barre di sangue / fame / sete.
 *
 * I trattamenti (stecche, tourniquette, sacche di sangue, kit chirurgici)
 * si applicano trascinando l'item dall'inventario sulla zona malata dello
 * stickman (o sulla barra del sangue per le trasfusioni). La validazione
 * e il consumo sono lato server (cnbt-health + cnbt-inventory).
 *
 * Dati: healthData da cnbt-health GetHealthPanelData() (via 'open'),
 * aggiornamenti live via messaggio 'healthUpdate' (cnbt-health:stateChanged).
 */

'use strict';

window.HealthPanel = (function () {
    // Dati completi (statici + stato) da cnbt-health; null se non avviato
    let data = null;
    let built = false;

    // Trattamento in corso: { itemName, zone, kind, timer }
    let activeProgress = null;

    // Zone del corpo sullo stickman medico (viewBox 200x420).
    // NB: guardando il personaggio di fronte, il suo braccio DESTRO è a
    // sinistra per chi guarda (mirroring anatomico).
    const HEALTH_ZONES = [
        { id: 'head',      shape: { type: 'ellipse', cx: 100, cy: 48, rx: 28, ry: 32 } },
        { id: 'lungs',     shape: { type: 'rect', x: 62,  y: 95,  w: 76, h: 45 } },
        { id: 'heart',     shape: { type: 'ellipse', cx: 112, cy: 122, rx: 13, ry: 13 } },
        { id: 'stomach',   shape: { type: 'rect', x: 66,  y: 176, w: 68, h: 36 } },
        { id: 'intestine', shape: { type: 'rect', x: 66,  y: 214, w: 68, h: 46 } },
        { id: 'right_arm', shape: { type: 'rect', x: 40,  y: 108, w: 26, h: 188 } },
        { id: 'left_arm',  shape: { type: 'rect', x: 134, y: 108, w: 26, h: 188 } },
        { id: 'right_leg', shape: { type: 'rect', x: 56,  y: 268, w: 42, h: 140 } },
        { id: 'left_leg',  shape: { type: 'rect', x: 102, y: 268, w: 42, h: 140 } },
    ];

    // ============================================
    // DATI
    // ============================================

    function setData(healthData) {
        data = healthData || null;
        built = false;
        stopProgress();
    }

    // Aggiornamento live dello stato (fratture/emorragie/organi/abrasioni/
    // sangue/fame/sete) da cnbt-health:stateChanged
    function update(state) {
        if (!data || !state) return;
        data.fractures = state.fractures || {};
        data.bleedings = state.bleedings || {};
        data.organs    = state.organs || {};
        data.abrasions = state.abrasions || {};
        if (state.blood != null) data.blood = state.blood;
        if (state.hunger != null) data.hunger = state.hunger;
        if (state.thirst != null) data.thirst = state.thirst;
        refresh();
    }

    function zoneLabel(zone) {
        if (zone === 'blood') return 'Sangue';
        const def = data && data.zones && data.zones[zone];
        return def ? def.label : zone;
    }

    // ============================================
    // COSTRUZIONE SVG
    // ============================================

    function build() {
        const container = document.getElementById('health-svg-container');
        if (!container) return;

        if (!data) {
            container.innerHTML = '<div class="health-offline">Sistema sanitario non attivo</div>';
            built = false;
            return;
        }

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 200 420');
        svg.setAttribute('class', 'body-svg health-svg');
        svg.id = 'health-svg';

        // Silhouette (stesso path della scheda Vestiario)
        const bodyG = document.createElementNS(svgNS, 'g');
        const outline = document.createElementNS(svgNS, 'path');
        outline.setAttribute('d', window.UtilityPanel.BODY_OUTLINE_PATH);
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', 'var(--accent)');
        outline.setAttribute('stroke-width', '2');
        outline.setAttribute('stroke-linejoin', 'round');
        outline.setAttribute('class', 'body-path');
        bodyG.appendChild(outline);
        svg.appendChild(bodyG);

        // Zone di salute (aree colorate in base allo stato)
        const zonesG = document.createElementNS(svgNS, 'g');
        zonesG.setAttribute('class', 'health-zones');

        for (const zone of HEALTH_ZONES) {
            const s = zone.shape;
            let el;
            if (s.type === 'ellipse') {
                el = document.createElementNS(svgNS, 'ellipse');
                el.setAttribute('cx', s.cx);
                el.setAttribute('cy', s.cy);
                el.setAttribute('rx', s.rx);
                el.setAttribute('ry', s.ry);
            } else {
                el = document.createElementNS(svgNS, 'rect');
                el.setAttribute('x', s.x);
                el.setAttribute('y', s.y);
                el.setAttribute('width', s.w);
                el.setAttribute('height', s.h);
                el.setAttribute('rx', '5');
            }
            el.setAttribute('class', 'health-zone hz-ok');
            el.setAttribute('data-hzone', zone.id);

            const titleEl = document.createElementNS(svgNS, 'title');
            titleEl.textContent = zoneLabel(zone.id);
            el.appendChild(titleEl);

            zonesG.appendChild(el);
        }
        svg.appendChild(zonesG);

        container.innerHTML = '';
        container.appendChild(svg);
        built = true;
        refresh();
    }

    // ============================================
    // REFRESH STATO (colori zone, barre, lista condizioni)
    // ============================================

    // Ritorna { cls, conditions[] } per una zona
    function zoneStatus(zone) {
        if (!data) return { cls: 'hz-ok', conditions: [] };
        const conditions = [];
        let rank = 0; // 0 ok, 1 abrasione, 2 warn, 3 danger

        const fr = data.fractures && data.fractures[zone];
        if (fr) {
            const label = (data.severityLabels && data.severityLabels[fr]) || fr;
            conditions.push({ label: label, severity: fr === 'grave' ? 'danger' : 'warn' });
            rank = Math.max(rank, fr === 'grave' ? 3 : 2);
        }

        const bl = data.bleedings && data.bleedings[zone];
        if (bl) {
            const label = (data.bleedingLabels && data.bleedingLabels[bl]) || bl;
            conditions.push({ label: label, severity: bl === 'heavy' ? 'danger' : 'warn', bleeding: true });
            rank = Math.max(rank, bl === 'heavy' ? 3 : 2);
        }

        const org = data.organs && data.organs[zone];
        if (org) {
            const labels = data.organLabels && data.organLabels[zone];
            const label = (labels && labels[org]) || org;
            conditions.push({ label: label, severity: org === 'media' ? 'warn' : 'danger' });
            rank = Math.max(rank, org === 'media' ? 2 : 3);
        }

        const ab = data.abrasions && data.abrasions[zone];
        if (ab) {
            conditions.push({ label: data.abrasionLabel || 'Abrasione', severity: 'abrasion' });
            rank = Math.max(rank, 1);
        }

        const cls = rank === 3 ? 'hz-danger'
            : rank === 2 ? 'hz-warn'
            : rank === 1 ? 'hz-abrasion'
            : 'hz-ok';
        return { cls: cls, conditions: conditions, bleeding: !!bl };
    }

    function refresh() {
        if (!data) return;
        if (!built) { build(); return; }

        // Zone dello stickman
        for (const zone of HEALTH_ZONES) {
            const el = document.querySelector('#health-svg [data-hzone="' + zone.id + '"]');
            if (!el) continue;
            const st = zoneStatus(zone.id);
            el.classList.remove('hz-ok', 'hz-warn', 'hz-danger', 'hz-abrasion', 'hz-bleeding');
            el.classList.add(st.cls);
            if (st.bleeding) el.classList.add('hz-bleeding');
        }

        // Lista condizioni attive
        const list = document.getElementById('health-conditions');
        if (list) {
            list.innerHTML = '';
            let any = false;
            for (const zone of HEALTH_ZONES) {
                const st = zoneStatus(zone.id);
                for (const cond of st.conditions) {
                    any = true;
                    const row = document.createElement('div');
                    row.className = 'health-cond hc-' + cond.severity;
                    const zl = document.createElement('span');
                    zl.className = 'hc-zone';
                    zl.textContent = zoneLabel(zone.id);
                    const cl = document.createElement('span');
                    cl.className = 'hc-label';
                    cl.textContent = cond.label;
                    row.appendChild(zl);
                    row.appendChild(cl);
                    list.appendChild(row);
                }
            }
            if (!any) {
                const row = document.createElement('div');
                row.className = 'health-cond hc-ok';
                row.textContent = 'Nessuna condizione attiva';
                list.appendChild(row);
            }
        }

        // Barra del sangue
        const bloodMax = data.bloodMax || 5500;
        const blood = Math.max(0, Math.min(bloodMax, data.blood != null ? data.blood : bloodMax));
        const bloodFill = document.getElementById('blood-fill');
        const bloodValue = document.getElementById('blood-value');
        const bloodWrap = document.getElementById('blood-bar-wrap');
        if (bloodFill) bloodFill.style.width = ((blood / bloodMax) * 100) + '%';
        if (bloodValue) bloodValue.textContent = blood + ' / ' + bloodMax + ' ml';
        if (bloodWrap && data.bloodThresholds) {
            bloodWrap.classList.toggle('hbar-warn',
                blood <= data.bloodThresholds.warn && blood > data.bloodThresholds.critical);
            bloodWrap.classList.toggle('hbar-critical', blood <= data.bloodThresholds.critical);
        }

        // Fame / sete (nascoste se esx_status non manda dati)
        updateNeedBar('hunger', data.hunger);
        updateNeedBar('thirst', data.thirst);
    }

    function updateNeedBar(name, pct) {
        const wrap = document.getElementById(name + '-bar-wrap');
        if (!wrap) return;
        if (pct == null) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');
        const fill = document.getElementById(name + '-fill');
        const value = document.getElementById(name + '-value');
        if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        if (value) value.textContent = Math.floor(pct) + '%';
        if (data.needsThresholds) {
            wrap.classList.toggle('hbar-warn',
                pct < data.needsThresholds.warn && pct >= data.needsThresholds.critical);
            wrap.classList.toggle('hbar-critical', pct < data.needsThresholds.critical);
        }
    }

    // ============================================
    // TRATTAMENTI (drag & drop dall'inventario)
    // ============================================

    // Tipo di trattamento per un item ('splint'|'tourniquet'|'bloodbag'|'surgery'|null)
    function treatmentKind(itemName) {
        if (!data || !itemName) return null;
        if (data.splints && data.splints[itemName]) return 'splint';
        if (data.tourniquets && data.tourniquets[itemName]) return 'tourniquet';
        if (data.bloodBags && data.bloodBags[itemName]) return 'bloodbag';
        if (data.surgeryKits && data.surgeryKits[itemName]) return 'surgery';
        return null;
    }

    function isTreatmentItem(itemName) {
        return treatmentKind(itemName) !== null;
    }

    // True se la zona ha la condizione che questo trattamento cura
    function zoneAcceptsTreatment(zone, kind) {
        if (!data) return false;
        if (kind === 'splint') {
            const zdef = data.zones && data.zones[zone];
            return !!(zdef && zdef.breakable && data.fractures && data.fractures[zone]);
        }
        if (kind === 'tourniquet') {
            return !!(data.bleedings && data.bleedings[zone]);
        }
        if (kind === 'surgery') {
            return !!(data.organs && data.organs[zone]);
        }
        return false;
    }

    function bloodBarAccepts(kind) {
        if (kind !== 'bloodbag' || !data) return false;
        const bloodMax = data.bloodMax || 5500;
        return (data.blood != null ? data.blood : bloodMax) < bloodMax;
    }

    function isPanelActive() {
        return window.UtilityPanel && window.UtilityPanel.isOpen()
            && window.UtilityPanel.getActiveTab() === 'health' && built && data;
    }

    // Evidenzia i bersagli validi mentre si trascina un trattamento
    function highlightTargets(itemName) {
        if (!isPanelActive()) return;
        const kind = treatmentKind(itemName);
        if (!kind) return;

        for (const zone of HEALTH_ZONES) {
            const el = document.querySelector('#health-svg [data-hzone="' + zone.id + '"]');
            if (el && zoneAcceptsTreatment(zone.id, kind)) {
                el.classList.add('hz-target');
            }
        }

        if (bloodBarAccepts(kind)) {
            const wrap = document.getElementById('blood-bar-wrap');
            if (wrap) wrap.classList.add('hbar-target');
        }
    }

    function clearTargetHighlights() {
        document.querySelectorAll('#health-svg .hz-target').forEach(function (el) {
            el.classList.remove('hz-target');
        });
        document.querySelectorAll('.hbar-target, .hbar-hover').forEach(function (el) {
            el.classList.remove('hbar-target', 'hbar-hover');
        });
        const prev = document.querySelector('#health-svg .hz-hover');
        if (prev) prev.classList.remove('hz-hover');
    }

    // Bersaglio valido sotto il cursore: { zone } oppure null.
    // 'blood' è la zona virtuale della barra del sangue.
    function getDropTargetAt(x, y, itemName) {
        if (!isPanelActive()) return null;
        const kind = treatmentKind(itemName);
        if (!kind) return null;

        // Barra del sangue (trasfusioni)
        if (kind === 'bloodbag') {
            const wrap = document.getElementById('blood-bar-wrap');
            if (wrap && bloodBarAccepts(kind)) {
                const rect = wrap.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return { zone: 'blood' };
                }
            }
            return null;
        }

        // Zone dello stickman: il cuore è disegnato sopra i polmoni,
        // quindi va controllato per primo (elemento più piccolo in cima)
        const ordered = ['heart'].concat(
            HEALTH_ZONES.map(function (z) { return z.id; })
                .filter(function (id) { return id !== 'heart'; }));

        for (const zoneId of ordered) {
            if (!zoneAcceptsTreatment(zoneId, kind)) continue;
            const el = document.querySelector('#health-svg [data-hzone="' + zoneId + '"]');
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return { zone: zoneId };
            }
        }
        return null;
    }

    // Evidenzia il bersaglio esatto sotto il cursore durante il drag
    function hoverTargetAt(x, y, itemName) {
        if (!isPanelActive()) return;
        const prev = document.querySelector('#health-svg .hz-hover');
        if (prev) prev.classList.remove('hz-hover');
        const bloodWrap = document.getElementById('blood-bar-wrap');
        if (bloodWrap) bloodWrap.classList.remove('hbar-hover');

        const target = getDropTargetAt(x, y, itemName);
        if (!target) return;
        if (target.zone === 'blood') {
            if (bloodWrap) bloodWrap.classList.add('hbar-hover');
        } else {
            const el = document.querySelector('#health-svg [data-hzone="' + target.zone + '"]');
            if (el) el.classList.add('hz-hover');
        }
    }

    // ============================================
    // PROGRESS TRATTAMENTO
    // ============================================

    function treatmentConfig(itemName) {
        const kind = treatmentKind(itemName);
        if (!kind) return null;
        const map = {
            splint: 'splints', tourniquet: 'tourniquets',
            bloodbag: 'bloodBags', surgery: 'surgeryKits',
        };
        return data[map[kind]][itemName];
    }

    function startProgress(itemName, zone) {
        const cfg = treatmentConfig(itemName);
        const duration = (cfg && cfg.duration) || 5000;

        stopProgress();

        const box = document.getElementById('health-progress');
        const label = document.getElementById('health-progress-label');
        const fill = document.getElementById('health-progress-fill');
        if (!box || !fill) return;

        const def = window.CNBT ? window.CNBT.getItemDef(itemName) : null;
        if (label) {
            label.textContent = (def ? def.label : itemName) + ' → ' + zoneLabel(zone);
        }

        box.classList.remove('hidden');
        fill.style.transition = 'none';
        fill.style.width = '0%';
        // reflow, poi anima fino al 100% nella durata del trattamento
        void fill.offsetWidth;
        fill.style.transition = 'width ' + duration + 'ms linear';
        fill.style.width = '100%';

        activeProgress = {
            itemName: itemName,
            zone: zone,
            // failsafe: se il risultato non arriva, nascondi comunque
            timer: setTimeout(function () { stopProgress(); }, duration + 4000),
        };
    }

    function stopProgress() {
        if (activeProgress && activeProgress.timer) {
            clearTimeout(activeProgress.timer);
        }
        activeProgress = null;
        const box = document.getElementById('health-progress');
        if (box) box.classList.add('hidden');
    }

    // Esito del trattamento dal server: aggiorna il badge usi dell'item
    // (o lo rimuove) e chiude la progressbar. Lo stato delle zone arriva
    // separatamente via healthUpdate (syncState).
    function handleTreatmentResult(result) {
        stopProgress();
        if (!result || !result.ok) return;

        if (result.grid && result.itemIndex != null && window.CNBT) {
            const grid = window.CNBT.getGrid(result.grid);
            const idx = result.itemIndex - 1; // Lua 1-indexed
            if (grid) {
                const item = grid.items[idx];
                if (item && item.name === result.itemName) {
                    if (result.removed) {
                        grid.removeItem(idx);
                    } else if (result.usesLeft != null) {
                        item.metadata = item.metadata || {};
                        item.metadata.uses = result.usesLeft;
                        if (item.el) {
                            let badge = item.el.querySelector('.item-uses');
                            if (!badge) {
                                badge = document.createElement('span');
                                badge.className = 'item-uses';
                                item.el.appendChild(badge);
                            }
                            badge.textContent = result.usesLeft;
                        }
                    }
                    window.CNBT.updateWeightDisplays();
                }
            }
        }
    }

    return {
        setData: setData,
        update: update,
        build: build,
        refresh: refresh,
        isTreatmentItem: isTreatmentItem,
        treatmentKind: treatmentKind,
        highlightTargets: highlightTargets,
        clearTargetHighlights: clearTargetHighlights,
        getDropTargetAt: getDropTargetAt,
        hoverTargetAt: hoverTargetAt,
        startProgress: startProgress,
        stopProgress: stopProgress,
        handleTreatmentResult: handleTreatmentResult,
        isPanelActive: isPanelActive,
    };
})();
