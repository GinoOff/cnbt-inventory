/**
 * CNBT Inventory - Health Panel (integrazione cnbt-health)
 *
 * Pannello a sinistra dello schermo, aperto insieme all'inventario.
 * Mostra uno stickman con le zone del corpo (testa, organi, braccia, gambe)
 * colorate in base allo stato delle fratture. Le stecche (splint) si
 * trascinano dall'inventario direttamente sulla zona fratturata: parte una
 * progressbar e, a fine applicazione, il server cura la frattura.
 */

'use strict';

window.HealthPanel = (function () {
    let isOpen = false;
    let data = null;        // { fractures, zones, splints, severityLabels, debug }
    let fractures = {};
    let busy = false;       // applicazione stecca in corso
    let progressRaf = null;
    let progressTimeout = null;

    // Ordine di visualizzazione delle zone nella lista sotto lo stickman
    const ZONE_ORDER = [
        'head', 'lungs', 'heart', 'stomach', 'intestine',
        'left_arm', 'right_arm', 'left_leg', 'right_leg',
    ];

    // Geometria delle zone sullo stickman (stesso viewBox 200x420 del
    // pannello Utilità per coerenza visiva). shapes = array di forme SVG.
    const ZONE_SHAPES = {
        head: [{ type: 'ellipse', cx: 100, cy: 48, rx: 26, ry: 30 }],
        lungs: [
            { type: 'rect', x: 72, y: 98, w: 25, h: 40, rx: 8 },
            { type: 'rect', x: 103, y: 98, w: 25, h: 40, rx: 8 },
        ],
        heart: [{ type: 'circle', cx: 94, cy: 116, r: 9 }],
        stomach: [{ type: 'rect', x: 72, y: 145, w: 56, h: 32, rx: 8 }],
        intestine: [{ type: 'rect', x: 72, y: 182, w: 56, h: 38, rx: 8 }],
        left_arm: [{ type: 'rect', x: 38, y: 112, w: 28, h: 180, rx: 10 }],
        right_arm: [{ type: 'rect', x: 134, y: 112, w: 28, h: 180, rx: 10 }],
        left_leg: [{ type: 'rect', x: 56, y: 268, w: 42, h: 142, rx: 10 }],
        right_leg: [{ type: 'rect', x: 102, y: 268, w: 42, h: 142, rx: 10 }],
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
            const shapes = ZONE_SHAPES[zoneKey];
            if (!shapes) continue;

            const g = document.createElementNS(svgNS, 'g');
            g.setAttribute('class', 'health-zone');
            g.setAttribute('data-hzone', zoneKey);

            const zoneDef = data && data.zones ? data.zones[zoneKey] : null;
            const title = document.createElementNS(svgNS, 'title');
            title.textContent = zoneDef ? zoneDef.label : zoneKey;
            g.appendChild(title);

            for (const shape of shapes) {
                g.appendChild(createShapeElement(shape));
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
            g.classList.remove('hz-media', 'hz-grave');
            const sev = fractures[zoneKey];
            if (sev === 'media') g.classList.add('hz-media');
            else if (sev === 'grave') g.classList.add('hz-grave');
        });
    }

    function renderZoneList() {
        const list = document.getElementById('health-zone-list');
        if (!list || !data) return;
        list.innerHTML = '';

        for (const zoneKey of ZONE_ORDER) {
            const zoneDef = data.zones ? data.zones[zoneKey] : null;
            if (!zoneDef) continue;

            const sev = fractures[zoneKey];
            // Gli organi non ancora gestiti compaiono solo se danneggiati
            if (!zoneDef.breakable && !sev) continue;

            const row = document.createElement('div');
            row.className = 'health-row' + (sev ? ' health-row-' + sev : '');

            const name = document.createElement('span');
            name.className = 'health-row-name';
            name.textContent = zoneDef.label;
            row.appendChild(name);

            const status = document.createElement('span');
            status.className = 'health-row-status';
            if (sev) {
                status.textContent = (data.severityLabels && data.severityLabels[sev]) || sev;
            } else {
                status.textContent = 'OK';
            }
            row.appendChild(status);

            list.appendChild(row);
        }
    }

    function render() {
        renderZones();
        renderZoneList();
    }

    // ============================================
    // OPEN / CLOSE / UPDATE
    // ============================================

    function open(healthData) {
        const panel = document.getElementById('health-panel');
        if (!panel) return;

        data = healthData || {};
        fractures = data.fractures || {};
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

    function update(newFractures) {
        fractures = newFractures || {};
        if (isOpen) render();
    }

    // ============================================
    // DRAG & DROP (chiamato da drag.js)
    // ============================================

    function isSplintItem(itemName) {
        return !!(data && data.splints && data.splints[itemName]);
    }

    // Una zona accetta il drop solo se è un osso rotto e non c'è
    // un'applicazione già in corso
    function canDropOn(zoneKey) {
        if (!isOpen || busy) return false;
        const zoneDef = data && data.zones ? data.zones[zoneKey] : null;
        return !!(zoneDef && zoneDef.breakable && fractures[zoneKey]);
    }

    function getZoneAt(x, y) {
        if (!isOpen) return null;
        const zones = document.querySelectorAll('.health-zone');
        for (const g of zones) {
            const rect = g.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                if (canDropOn(g.dataset.hzone)) return g.dataset.hzone;
            }
        }
        return null;
    }

    function highlightForDrag(itemName) {
        if (!isOpen || !isSplintItem(itemName)) return;
        document.querySelectorAll('.health-zone').forEach(function (g) {
            if (canDropOn(g.dataset.hzone)) {
                g.classList.add('hz-droppable');
            }
        });
    }

    function hoverAt(x, y) {
        if (!isOpen) return;
        document.querySelectorAll('.health-zone.hz-hover').forEach(function (g) {
            g.classList.remove('hz-hover');
        });
        const zoneKey = getZoneAt(x, y);
        if (zoneKey) {
            const g = document.querySelector('.health-zone[data-hzone="' + zoneKey + '"]');
            if (g) g.classList.add('hz-hover');
        }
    }

    function clearDragHighlights() {
        document.querySelectorAll('.health-zone.hz-droppable, .health-zone.hz-hover')
            .forEach(function (g) {
                g.classList.remove('hz-droppable', 'hz-hover');
            });
    }

    // ============================================
    // PROGRESSBAR APPLICAZIONE STECCA
    // ============================================

    function startProgress(zoneKey, itemName) {
        if (!isOpen || busy) return;
        busy = true;

        const splint = data.splints[itemName] || {};
        const duration = splint.duration || 5000;
        const zoneDef = data.zones ? data.zones[zoneKey] : null;
        const itemDef = window.CNBT ? window.CNBT.getItemDef(itemName) : null;

        const wrap = document.getElementById('health-progress');
        const label = document.getElementById('health-progress-label');
        const fill = document.getElementById('health-progress-fill');
        if (!wrap || !fill) return;

        label.textContent = (itemDef ? itemDef.label : 'Stecca') + ' → ' +
            (zoneDef ? zoneDef.label : zoneKey);
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
                // La barra è piena: si attende l'esito del server (splintResult)
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
        isSplintItem: isSplintItem,
        getZoneAt: getZoneAt,
        highlightForDrag: highlightForDrag,
        hoverAt: hoverAt,
        clearDragHighlights: clearDragHighlights,
        startProgress: startProgress,
        finishProgress: finishProgress,
    };
})();
