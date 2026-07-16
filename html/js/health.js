/**
 * CNBT Inventory - Health Panel (integrazione cnbt-health)
 *
 * Pannello a sinistra dello schermo, aperto insieme all'inventario.
 * Mostra uno stickman con le zone del corpo (testa, organi, braccia, gambe):
 *   - fratture: zona riempita ambra (composta) o rossa pulsante (scomposta)
 *   - sanguinamenti: goccia di sangue sulla zona (leggero/medio/pesante)
 *
 * Trattamenti trascinabili dall'inventario sulla zona dello stickman:
 *   - stecche (splint)      -> curano le fratture delle ossa
 *   - tourniquette          -> fermano i sanguinamenti
 * Al drop parte una progressbar; a fine applicazione il server valida,
 * consuma un uso dell'item e cura la condizione.
 */

'use strict';

window.HealthPanel = (function () {
    let isOpen = false;
    let data = null;        // { fractures, bleedings, blood, zones, splints, tourniquets, bloodBags, ... }
    let fractures = {};
    let bleedings = {};
    let blood = null;       // ml correnti (null = sistema sangue non disponibile)
    let hunger = null;      // % fame (null = esx_status non disponibile)
    let thirst = null;      // % sete
    let busy = false;       // applicazione trattamento in corso
    let progressRaf = null;
    let progressTimeout = null;

    // Ordine di visualizzazione delle zone nella lista sotto lo stickman
    const ZONE_ORDER = [
        'head', 'lungs', 'heart', 'stomach', 'intestine',
        'left_arm', 'right_arm', 'left_leg', 'right_leg',
    ];

    // Geometria delle zone sullo stickman (stesso viewBox 200x420 del
    // pannello Utilità per coerenza visiva).
    //   shapes = forme SVG cliccabili/colorabili
    //   drop   = punto di ancoraggio della goccia di sanguinamento
    const ZONE_SHAPES = {
        head: {
            shapes: [{ type: 'ellipse', cx: 100, cy: 48, rx: 26, ry: 30 }],
            drop: { x: 130, y: 40 },
        },
        lungs: {
            shapes: [
                { type: 'rect', x: 72, y: 98, w: 25, h: 40, rx: 8 },
                { type: 'rect', x: 103, y: 98, w: 25, h: 40, rx: 8 },
            ],
            drop: { x: 134, y: 100 },
        },
        heart: {
            shapes: [{ type: 'circle', cx: 94, cy: 116, r: 9 }],
            drop: { x: 80, y: 108 },
        },
        stomach: {
            shapes: [{ type: 'rect', x: 72, y: 145, w: 56, h: 32, rx: 8 }],
            drop: { x: 134, y: 152 },
        },
        intestine: {
            shapes: [{ type: 'rect', x: 72, y: 182, w: 56, h: 38, rx: 8 }],
            drop: { x: 134, y: 192 },
        },
        left_arm: {
            shapes: [{ type: 'rect', x: 38, y: 112, w: 28, h: 180, rx: 10 }],
            drop: { x: 32, y: 160 },
        },
        right_arm: {
            shapes: [{ type: 'rect', x: 134, y: 112, w: 28, h: 180, rx: 10 }],
            drop: { x: 168, y: 160 },
        },
        left_leg: {
            shapes: [{ type: 'rect', x: 56, y: 268, w: 42, h: 142, rx: 10 }],
            drop: { x: 48, y: 310 },
        },
        right_leg: {
            shapes: [{ type: 'rect', x: 102, y: 268, w: 42, h: 142, rx: 10 }],
            drop: { x: 152, y: 310 },
        },
    };

    const svgNS = 'http://www.w3.org/2000/svg';

    // ============================================
    // COSTRUZIONE SVG
    // ============================================

    function buildBodyOutline() {
        // Stessa silhouette del pannello Utilità (utility.js)
        const outline = document.createElementNS(svgNS, 'path');
        outline.setAttribute('d',
            'M100,18 ' +
            'C115,18 126,30 126,48 C126,66 115,78 100,78 C85,78 74,66 74,48 C74,30 85,18 100,18 Z ' +
            'M90,78 L90,90 L110,90 L110,78 ' +
            'M110,90 L140,100 Q155,105 155,118 L155,200 ' +
            'L155,200 Q158,220 152,240 L145,270 Q140,285 142,295 L142,295 ' +
            'L130,295 Q132,285 135,270 L140,245 Q145,225 142,210 ' +
            'L142,210 L140,230 L135,260 ' +
            'L138,300 L140,340 L142,370 Q143,385 138,395 L138,405 ' +
            'L115,405 L115,395 L118,380 L120,340 L118,300 ' +
            'L115,270 L100,265 L85,270 ' +
            'L82,300 L80,340 L85,380 L85,395 L85,405 ' +
            'L62,405 L62,395 Q57,385 58,370 L60,340 L62,300 ' +
            'L65,260 L60,230 L58,210 ' +
            'Q55,225 60,245 L65,270 Q68,285 70,295 ' +
            'L58,295 Q60,285 55,270 L48,240 Q42,220 45,200 ' +
            'L45,118 Q45,105 60,100 L90,90'
        );
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', 'var(--accent)');
        outline.setAttribute('stroke-width', '2');
        outline.setAttribute('stroke-linejoin', 'round');
        return outline;
    }

    function createShapeElement(shape) {
        let el;
        if (shape.type === 'ellipse') {
            el = document.createElementNS(svgNS, 'ellipse');
            el.setAttribute('cx', shape.cx);
            el.setAttribute('cy', shape.cy);
            el.setAttribute('rx', shape.rx);
            el.setAttribute('ry', shape.ry);
        } else if (shape.type === 'circle') {
            el = document.createElementNS(svgNS, 'circle');
            el.setAttribute('cx', shape.cx);
            el.setAttribute('cy', shape.cy);
            el.setAttribute('r', shape.r);
        } else {
            el = document.createElementNS(svgNS, 'rect');
            el.setAttribute('x', shape.x);
            el.setAttribute('y', shape.y);
            el.setAttribute('width', shape.w);
            el.setAttribute('height', shape.h);
            el.setAttribute('rx', shape.rx || 4);
        }
        return el;
    }

    // Goccia di sangue posizionata sull'ancoraggio della zona
    function createDropletElement(anchor) {
        const drop = document.createElementNS(svgNS, 'path');
        drop.setAttribute('d',
            'M0,-8 C4,-3 7,0.5 7,3.5 A7,7 0 1 1 -7,3.5 C-7,0.5 -4,-3 0,-8 Z');
        drop.setAttribute('transform',
            'translate(' + anchor.x + ',' + anchor.y + ')');
        drop.setAttribute('class', 'health-drop');
        drop.style.display = 'none';
        return drop;
    }

    function buildSVG() {
        const container = document.getElementById('health-svg-container');
        if (!container) return;

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 200 420');
        svg.setAttribute('class', 'health-svg');
        svg.id = 'health-svg';

        svg.appendChild(buildBodyOutline());

        // Gruppi zona: ogni zona ha data-hzone e riceve classi di stato
        for (const zoneKey of ZONE_ORDER) {
            const zoneGeom = ZONE_SHAPES[zoneKey];
            if (!zoneGeom) continue;

            const g = document.createElementNS(svgNS, 'g');
            g.setAttribute('class', 'health-zone');
            g.setAttribute('data-hzone', zoneKey);

            const zoneDef = data && data.zones ? data.zones[zoneKey] : null;
            const title = document.createElementNS(svgNS, 'title');
            title.textContent = zoneDef ? zoneDef.label : zoneKey;
            g.appendChild(title);

            for (const shape of zoneGeom.shapes) {
                g.appendChild(createShapeElement(shape));
            }
            if (zoneGeom.drop) {
                g.appendChild(createDropletElement(zoneGeom.drop));
            }
            svg.appendChild(g);
        }

        container.innerHTML = '';
        container.appendChild(svg);
    }

    // ============================================
    // RENDER STATO
    // ============================================

    function renderZones() {
        document.querySelectorAll('.health-zone').forEach(function (g) {
            const zoneKey = g.dataset.hzone;

            // Frattura: riempimento della zona
            g.classList.remove('hz-media', 'hz-grave');
            const frSev = fractures[zoneKey];
            if (frSev === 'media') g.classList.add('hz-media');
            else if (frSev === 'grave') g.classList.add('hz-grave');

            // Sanguinamento: goccia colorata
            const drop = g.querySelector('.health-drop');
            if (drop) {
                drop.classList.remove('hd-light', 'hd-medium', 'hd-heavy');
                const blSev = bleedings[zoneKey];
                if (blSev) {
                    drop.classList.add('hd-' + blSev);
                    drop.style.display = '';
                } else {
                    drop.style.display = 'none';
                }
            }
        });
    }

    function renderZoneList() {
        const list = document.getElementById('health-zone-list');
        if (!list || !data) return;
        list.innerHTML = '';

        for (const zoneKey of ZONE_ORDER) {
            const zoneDef = data.zones ? data.zones[zoneKey] : null;
            if (!zoneDef) continue;

            const frSev = fractures[zoneKey];
            const blSev = bleedings[zoneKey];

            // Gli organi non ancora gestiti compaiono solo se hanno una condizione
            if (!zoneDef.breakable && !frSev && !blSev) continue;

            const row = document.createElement('div');
            let rowClass = 'health-row';
            if (blSev === 'heavy' || frSev === 'grave') rowClass += ' health-row-grave';
            else if (blSev || frSev) rowClass += ' health-row-media';
            row.className = rowClass;

            const name = document.createElement('span');
            name.className = 'health-row-name';
            name.textContent = zoneDef.label;
            row.appendChild(name);

            const statusWrap = document.createElement('span');
            statusWrap.className = 'health-row-statuses';

            if (!frSev && !blSev) {
                const okEl = document.createElement('span');
                okEl.className = 'health-row-status';
                okEl.textContent = 'OK';
                statusWrap.appendChild(okEl);
            } else {
                if (frSev) {
                    const frEl = document.createElement('span');
                    frEl.className = 'health-row-status hs-fracture-' + frSev;
                    frEl.textContent =
                        (data.severityLabels && data.severityLabels[frSev]) || frSev;
                    statusWrap.appendChild(frEl);
                }
                if (blSev) {
                    const blEl = document.createElement('span');
                    blEl.className = 'health-row-status hs-bleed-' + blSev;
                    blEl.textContent =
                        (data.bleedingLabels && data.bleedingLabels[blSev]) || blSev;
                    statusWrap.appendChild(blEl);
                }
            }

            row.appendChild(statusWrap);
            list.appendChild(row);
        }
    }

    // Barra del sangue sotto lo stickman ("quanto sangue mi resta")
    function renderBloodBar() {
        const wrap = document.getElementById('blood-bar-wrap');
        if (!wrap) return;

        const max = data && data.bloodMax;
        if (blood == null || !max) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');

        const mlEl = document.getElementById('blood-ml');
        const fill = document.getElementById('blood-bar-fill');
        if (mlEl) mlEl.textContent = blood + ' / ' + max + ' ml';
        if (fill) {
            const pct = Math.max(0, Math.min(100, (blood / max) * 100));
            fill.style.width = pct + '%';
        }

        const th = data.bloodThresholds || {};
        wrap.classList.remove('bb-low', 'bb-critical');
        if (th.critical != null && blood <= th.critical) {
            wrap.classList.add('bb-critical');
        } else if (th.warn != null && blood <= th.warn) {
            wrap.classList.add('bb-low');
        }
    }

    // Barre fame e sete sotto la barra del sangue
    function renderNeedsBars() {
        const wrap = document.getElementById('needs-bars');
        if (!wrap) return;

        if (hunger == null && thirst == null) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');

        const th = (data && data.needsThresholds) || { warn: 50, critical: 1 };

        function renderNeed(id, pct) {
            const barWrap = document.getElementById('need-' + id);
            const pctEl = document.getElementById(id + '-pct');
            const fill = document.getElementById(id + '-fill');
            if (!barWrap) return;

            if (pct == null) {
                barWrap.classList.add('hidden');
                return;
            }
            barWrap.classList.remove('hidden');
            if (pctEl) pctEl.textContent = Math.floor(pct) + '%';
            if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';

            barWrap.classList.remove('nb-warn', 'nb-critical');
            if (pct < th.critical) barWrap.classList.add('nb-critical');
            else if (pct < th.warn) barWrap.classList.add('nb-warn');
        }

        renderNeed('hunger', hunger);
        renderNeed('thirst', thirst);
    }

    function render() {
        renderZones();
        renderZoneList();
        renderBloodBar();
        renderNeedsBars();
    }

    // ============================================
    // OPEN / CLOSE / UPDATE
    // ============================================

    function open(healthData) {
        const panel = document.getElementById('health-panel');
        if (!panel) return;

        data = healthData || {};
        fractures = data.fractures || {};
        bleedings = data.bleedings || {};
        blood = (typeof data.blood === 'number') ? data.blood : null;
        hunger = (typeof data.hunger === 'number') ? data.hunger : null;
        thirst = (typeof data.thirst === 'number') ? data.thirst : null;
        busy = false;

        buildSVG();
        render();
        hideProgress(true);

        panel.classList.remove('hidden');
        isOpen = true;
    }

    function close() {
        const panel = document.getElementById('health-panel');
        if (!panel) return;
        panel.classList.add('hidden');
        isOpen = false;
        busy = false;
        hideProgress(true);
        clearDragHighlights();
    }

    function update(newFractures, newBleedings, newBlood, newHunger, newThirst) {
        fractures = newFractures || {};
        bleedings = newBleedings || {};
        if (typeof newBlood === 'number') blood = newBlood;
        if (typeof newHunger === 'number') hunger = newHunger;
        if (typeof newThirst === 'number') thirst = newThirst;
        if (isOpen) render();
    }

    // ============================================
    // DRAG & DROP (chiamato da drag.js)
    // ============================================

    // Ritorna 'splint' | 'tourniquet' | 'bloodbag' | null per un item
    function treatmentKindFor(itemName) {
        if (!data) return null;
        if (data.splints && data.splints[itemName]) return 'splint';
        if (data.tourniquets && data.tourniquets[itemName]) return 'tourniquet';
        if (data.bloodBags && data.bloodBags[itemName]) return 'bloodbag';
        return null;
    }

    function isTreatmentItem(itemName) {
        return treatmentKindFor(itemName) !== null;
    }

    // Una zona accetta il drop solo se ha la condizione curata dal trattamento.
    // La zona virtuale 'blood' e' la barra del sangue (sacche di sangue).
    function canDropOn(zoneKey, kind) {
        if (!isOpen || busy || !kind) return false;
        if (kind === 'bloodbag') {
            return zoneKey === 'blood' && blood != null &&
                data && data.bloodMax && blood < data.bloodMax;
        }
        const zoneDef = data && data.zones ? data.zones[zoneKey] : null;
        if (!zoneDef) return false;
        if (kind === 'splint') {
            return !!(zoneDef.breakable && fractures[zoneKey]);
        }
        return !!bleedings[zoneKey]; // tourniquet
    }

    function getZoneAt(x, y, itemName) {
        if (!isOpen) return null;
        const kind = treatmentKindFor(itemName);
        if (!kind) return null;

        // Sacche di sangue: il drop target e' la barra del sangue
        if (kind === 'bloodbag') {
            const wrap = document.getElementById('blood-bar-wrap');
            if (!wrap || wrap.classList.contains('hidden')) return null;
            const rect = wrap.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                if (canDropOn('blood', kind)) return 'blood';
            }
            return null;
        }

        // Le zone possono sovrapporsi (es. cuore dentro il petto): tra le
        // candidate si sceglie quella con l'area piu' piccola
        let best = null;
        let bestArea = Infinity;
        const zones = document.querySelectorAll('.health-zone');
        for (const g of zones) {
            const rect = g.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                if (canDropOn(g.dataset.hzone, kind)) {
                    const area = rect.width * rect.height;
                    if (area < bestArea) {
                        best = g.dataset.hzone;
                        bestArea = area;
                    }
                }
            }
        }
        return best;
    }

    function highlightForDrag(itemName) {
        const kind = treatmentKindFor(itemName);
        if (!isOpen || !kind) return;
        if (kind === 'bloodbag') {
            const wrap = document.getElementById('blood-bar-wrap');
            if (wrap && canDropOn('blood', kind)) {
                wrap.classList.add('bb-droppable');
            }
            return;
        }
        document.querySelectorAll('.health-zone').forEach(function (g) {
            if (canDropOn(g.dataset.hzone, kind)) {
                g.classList.add('hz-droppable');
            }
        });
    }

    function hoverAt(x, y, itemName) {
        if (!isOpen) return;
        document.querySelectorAll('.health-zone.hz-hover').forEach(function (g) {
            g.classList.remove('hz-hover');
        });
        const barWrap = document.getElementById('blood-bar-wrap');
        if (barWrap) barWrap.classList.remove('bb-hover');

        const zoneKey = getZoneAt(x, y, itemName);
        if (zoneKey === 'blood') {
            if (barWrap) barWrap.classList.add('bb-hover');
        } else if (zoneKey) {
            const g = document.querySelector('.health-zone[data-hzone="' + zoneKey + '"]');
            if (g) g.classList.add('hz-hover');
        }
    }

    function clearDragHighlights() {
        document.querySelectorAll('.health-zone.hz-droppable, .health-zone.hz-hover')
            .forEach(function (g) {
                g.classList.remove('hz-droppable', 'hz-hover');
            });
        const barWrap = document.getElementById('blood-bar-wrap');
        if (barWrap) barWrap.classList.remove('bb-droppable', 'bb-hover');
    }

    // ============================================
    // PROGRESSBAR APPLICAZIONE TRATTAMENTO
    // ============================================

    function startProgress(zoneKey, itemName) {
        if (!isOpen || busy) return;
        busy = true;

        const kind = treatmentKindFor(itemName);
        let cfgSource = data.splints;
        if (kind === 'tourniquet') cfgSource = data.tourniquets;
        else if (kind === 'bloodbag') cfgSource = data.bloodBags;
        const treatCfg = (cfgSource && cfgSource[itemName]) || {};
        const duration = treatCfg.duration || 5000;
        const zoneDef = data.zones ? data.zones[zoneKey] : null;
        const itemDef = window.CNBT ? window.CNBT.getItemDef(itemName) : null;

        const wrap = document.getElementById('health-progress');
        const label = document.getElementById('health-progress-label');
        const fill = document.getElementById('health-progress-fill');
        if (!wrap || !fill) return;

        const zoneLabel = zoneKey === 'blood' ? 'Sangue'
            : (zoneDef ? zoneDef.label : zoneKey);
        label.textContent = (itemDef ? itemDef.label : 'Trattamento') + ' → ' + zoneLabel;
        fill.style.width = '0%';
        fill.classList.remove('hp-fail');
        wrap.classList.remove('hidden');

        const start = performance.now();
        function step(now) {
            const pct = Math.min(100, ((now - start) / duration) * 100);
            fill.style.width = pct + '%';
            if (pct < 100) {
                progressRaf = requestAnimationFrame(step);
            } else {
                progressRaf = null;
                // La barra è piena: si attende l'esito del server (treatmentResult)
            }
        }
        progressRaf = requestAnimationFrame(step);
    }

    function finishProgress(ok) {
        busy = false;
        const fill = document.getElementById('health-progress-fill');
        if (progressRaf) {
            cancelAnimationFrame(progressRaf);
            progressRaf = null;
        }
        if (fill) {
            if (ok) {
                fill.style.width = '100%';
            } else {
                fill.classList.add('hp-fail');
            }
        }
        if (progressTimeout) clearTimeout(progressTimeout);
        progressTimeout = setTimeout(function () {
            hideProgress(false);
        }, ok ? 350 : 900);
    }

    function hideProgress(immediate) {
        const wrap = document.getElementById('health-progress');
        const fill = document.getElementById('health-progress-fill');
        if (progressRaf) {
            cancelAnimationFrame(progressRaf);
            progressRaf = null;
        }
        if (progressTimeout && immediate) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
        }
        if (wrap) wrap.classList.add('hidden');
        if (fill) {
            fill.style.width = '0%';
            fill.classList.remove('hp-fail');
        }
    }

    // ============================================
    // API
    // ============================================

    return {
        open: open,
        close: close,
        update: update,
        isOpen: function () { return isOpen; },
        isBusy: function () { return busy; },
        isTreatmentItem: isTreatmentItem,
        treatmentKindFor: treatmentKindFor,
        getZoneAt: getZoneAt,
        highlightForDrag: highlightForDrag,
        hoverAt: hoverAt,
        clearDragHighlights: clearDragHighlights,
        startProgress: startProgress,
        finishProgress: finishProgress,
    };
})();
