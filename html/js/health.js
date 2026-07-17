/**
 * CNBT Inventory - Health Panel (integrazione cnbt-health)
 *
 * Pannello a sinistra dello schermo, aperto insieme all'inventario.
 * Corpo in stile "raggi X" (silhouette + scheletro + organi disegnati in
 * SVG): ogni zona e' BIANCA se sana, GIALLA o ROSSA in base alla gravita'
 * delle condizioni attive (fratture, sanguinamenti, danni agli organi).
 * I sanguinamenti mostrano anche una goccia di sangue accanto alla zona.
 *
 * Trattamenti trascinabili dall'inventario:
 *   - stecche (splint)      -> zona fratturata
 *   - tourniquette          -> zona che sanguina
 *   - sacche di sangue      -> barra del sangue
 *   - kit di chirurgia      -> organo danneggiato
 * Al drop parte una progressbar; a fine applicazione il server valida,
 * consuma un uso dell'item e cura la condizione.
 */

'use strict';

window.HealthPanel = (function () {
    let isOpen = false;
    let data = null;        // { fractures, bleedings, organs, blood, zones, splints, ... }
    let fractures = {};
    let bleedings = {};
    let organs = {};        // { zone: 'damaged' | 'media' | 'grave' }
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

    // Ordine di costruzione nell'SVG: prima gli organi (le costole della
    // gabbia toracica vengono disegnate sopra, effetto raggi X), poi le
    // zone esterne (testa e arti)
    const ORGAN_ZONES = ['lungs', 'heart', 'stomach', 'intestine'];
    const OUTER_ZONES = ['head', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];

    // Ancoraggio della goccia di sanguinamento per zona (viewBox 200x420)
    const ZONE_DROPS = {
        head:      { x: 132, y: 28 },
        lungs:     { x: 140, y: 104 },
        heart:     { x: 62, y: 112 },
        stomach:   { x: 140, y: 172 },
        intestine: { x: 140, y: 218 },
        left_arm:  { x: 24, y: 170 },
        right_arm: { x: 176, y: 170 },
        left_leg:  { x: 58, y: 330 },
        right_leg: { x: 142, y: 330 },
    };

    const svgNS = 'http://www.w3.org/2000/svg';

    // ============================================
    // COSTRUZIONE SVG (corpo a raggi X)
    // ============================================

    function svgEl(tag, attrs, parent) {
        const node = document.createElementNS(svgNS, tag);
        for (const k in attrs) node.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(node);
        return node;
    }

    function boneLine(g, x1, y1, x2, y2, w, opacity) {
        return svgEl('line', {
            x1: x1, y1: y1, x2: x2, y2: y2,
            stroke: 'currentColor', 'stroke-width': w, 'stroke-linecap': 'round',
            opacity: opacity != null ? opacity : 0.9,
        }, g);
    }

    function joint(g, cx, cy, r) {
        return svgEl('circle', { cx: cx, cy: cy, r: r, fill: 'currentColor', opacity: 0.95 }, g);
    }

    // Griglia di sfondo + righelli laterali (estetica scanner)
    function buildGrid(svg) {
        const grid = svgEl('g', { class: 'hb-grid' }, svg);
        for (let x = 0; x <= 200; x += 20) {
            svgEl('line', { x1: x, y1: 0, x2: x, y2: 420, 'stroke-width': 0.5 }, grid);
        }
        for (let y = 0; y <= 420; y += 20) {
            svgEl('line', { x1: 0, y1: y, x2: 200, y2: y, 'stroke-width': 0.5 }, grid);
        }
        const ruler = svgEl('g', { class: 'hb-ruler' }, svg);
        for (let y = 10; y < 420; y += 10) {
            const len = (y % 50 === 0) ? 7 : 4;
            svgEl('line', { x1: 0, y1: y, x2: len, y2: y, 'stroke-width': 1 }, ruler);
            svgEl('line', { x1: 200 - len, y1: y, x2: 200, y2: y, 'stroke-width': 1 }, ruler);
        }
    }

    // Silhouette del corpo (alone "carne" traslucido)
    function buildFlesh(svg) {
        const flesh = svgEl('g', {}, svg);
        // testa e collo
        svgEl('circle', { cx: 100, cy: 38, r: 23, class: 'hb-flesh-fill' }, flesh);
        svgEl('line', { x1: 100, y1: 54, x2: 100, y2: 74, class: 'hb-flesh', 'stroke-width': 15, 'stroke-linecap': 'round' }, flesh);
        // torso
        svgEl('path', {
            d: 'M83,62 L117,62 L136,86 L128,196 L124,262 L76,262 L72,196 L64,86 Z',
            class: 'hb-flesh-fill', 'stroke-linejoin': 'round',
        }, flesh);
        // braccia (leggermente aperte come nella radiografia)
        const arms = [
            [70, 90, 48, 174, 16], [48, 174, 33, 258, 12],
            [130, 90, 152, 174, 16], [152, 174, 167, 258, 12],
        ];
        for (const a of arms) {
            svgEl('line', { x1: a[0], y1: a[1], x2: a[2], y2: a[3], class: 'hb-flesh', 'stroke-width': a[4], 'stroke-linecap': 'round' }, flesh);
        }
        svgEl('circle', { cx: 31, cy: 272, r: 8, class: 'hb-flesh-fill' }, flesh);
        svgEl('circle', { cx: 169, cy: 272, r: 8, class: 'hb-flesh-fill' }, flesh);
        // gambe
        const legs = [
            [86, 264, 81, 332, 18], [81, 332, 78, 400, 14], [78, 400, 64, 407, 9],
            [114, 264, 119, 332, 18], [119, 332, 122, 400, 14], [122, 400, 136, 407, 9],
        ];
        for (const l of legs) {
            svgEl('line', { x1: l[0], y1: l[1], x2: l[2], y2: l[3], class: 'hb-flesh', 'stroke-width': l[4], 'stroke-linecap': 'round' }, flesh);
        }
    }

    // Scheletro decorativo (non colorabile): colonna, clavicole, costole,
    // bacino. Le costole stanno SOPRA i polmoni per l'effetto raggi X.
    function buildSkeletonDecor(svg) {
        const decor = svgEl('g', { class: 'hb-decor' }, svg);
        // colonna vertebrale (tratteggiata = vertebre)
        svgEl('line', {
            x1: 100, y1: 74, x2: 100, y2: 250,
            stroke: 'currentColor', 'stroke-width': 6, 'stroke-dasharray': '5 3',
        }, decor);
        // clavicole
        svgEl('path', {
            d: 'M100,84 C90,80 78,84 70,90 M100,84 C110,80 122,84 130,90',
            fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5,
        }, decor);
        // gabbia toracica
        for (let i = 0; i < 5; i++) {
            const y = 100 + i * 13;
            svgEl('path', {
                d: 'M100,' + y + ' C88,' + (y + 1) + ' 78,' + (y + 5) + ' 76,' + (y + 10),
                fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
            }, decor);
            svgEl('path', {
                d: 'M100,' + y + ' C112,' + (y + 1) + ' 122,' + (y + 5) + ' 124,' + (y + 10),
                fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
            }, decor);
        }
        // bacino
        svgEl('path', {
            d: 'M84,246 C74,250 72,262 80,266 C88,270 96,264 100,256 C104,264 112,270 120,266 C128,262 126,250 116,246',
            fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5,
        }, decor);
    }

    // Anatomia colorabile per zona (fill/stroke = currentColor del gruppo)
    const ZONE_BUILDERS = {
        head: function (g) {
            // cranio
            svgEl('circle', { cx: 100, cy: 36, r: 17, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }, g);
            // mandibola
            svgEl('path', { d: 'M88,46 Q100,60 112,46', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, g);
            // cervello
            svgEl('path', {
                d: 'M87,33 C85,22 97,17 100,22 C103,17 115,22 113,33 C112,39 104,42 100,40 C96,42 88,39 87,33 Z',
                fill: 'currentColor', opacity: 0.75,
            }, g);
            svgEl('line', { x1: 100, y1: 22, x2: 100, y2: 40, stroke: 'currentColor', 'stroke-width': 1, opacity: 0.5 }, g);
            svgEl('circle', { cx: 100, cy: 38, r: 24, fill: 'transparent', class: 'hz-hit' }, g);
        },
        lungs: function (g) {
            // trachea
            svgEl('path', {
                d: 'M100,78 V93 M100,93 L94,100 M100,93 L106,100',
                fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, opacity: 0.8,
            }, g);
            // lobo sinistro
            svgEl('path', {
                d: 'M96,96 C96,91 89,91 84,96 C76,104 73,122 75,142 C76,153 82,158 89,155 C94,152 96,144 96,130 Z',
                fill: 'currentColor', opacity: 0.7,
            }, g);
            // lobo destro
            svgEl('path', {
                d: 'M104,96 C104,91 111,91 116,96 C124,104 127,122 125,142 C124,153 118,158 111,155 C106,152 104,144 104,130 Z',
                fill: 'currentColor', opacity: 0.7,
            }, g);
        },
        heart: function (g) {
            svgEl('path', {
                d: 'M93,107 C87,101 77,105 77,114 C77,124 86,132 93,138 C99,133 107,126 107,116 C107,106 98,102 93,107 Z',
                fill: 'currentColor', opacity: 0.92,
            }, g);
        },
        stomach: function (g) {
            svgEl('path', {
                d: 'M90,160 C88,154 96,152 100,156 C104,160 114,162 117,170 C120,180 112,188 101,187 C88,186 83,172 90,160 Z',
                fill: 'currentColor', opacity: 0.8,
            }, g);
        },
        intestine: function (g) {
            // colon (cornice)
            svgEl('path', { d: 'M77,196 C73,212 73,230 78,246', fill: 'none', stroke: 'currentColor', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.5 }, g);
            svgEl('path', { d: 'M123,196 C127,212 127,230 122,246', fill: 'none', stroke: 'currentColor', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.5 }, g);
            // anse intestinali
            const coils = [
                'M82,200 C92,196 108,204 118,200',
                'M82,213 C92,209 108,217 118,213',
                'M82,226 C92,222 108,230 118,226',
                'M84,239 C94,235 106,243 114,239',
            ];
            for (const d of coils) {
                svgEl('path', { d: d, fill: 'none', stroke: 'currentColor', 'stroke-width': 8, 'stroke-linecap': 'round', opacity: 0.65 }, g);
            }
        },
        left_arm: function (g) {
            boneLine(g, 71, 90, 49, 172, 4.5);  // omero
            boneLine(g, 49, 172, 34, 254, 3);   // radio
            boneLine(g, 53, 175, 39, 256, 2);   // ulna
            joint(g, 71, 90, 4.5);
            joint(g, 49, 172, 4);
            joint(g, 36, 256, 3.5);
            // mano
            boneLine(g, 35, 259, 29, 276, 2);
            boneLine(g, 35, 259, 33, 278, 2);
            boneLine(g, 35, 259, 37, 277, 2);
            svgEl('polygon', { points: '58,82 84,94 48,282 16,272', fill: 'transparent', class: 'hz-hit' }, g);
        },
        right_arm: function (g) {
            boneLine(g, 129, 90, 151, 172, 4.5);
            boneLine(g, 151, 172, 166, 254, 3);
            boneLine(g, 147, 175, 161, 256, 2);
            joint(g, 129, 90, 4.5);
            joint(g, 151, 172, 4);
            joint(g, 164, 256, 3.5);
            boneLine(g, 165, 259, 171, 276, 2);
            boneLine(g, 165, 259, 167, 278, 2);
            boneLine(g, 165, 259, 163, 277, 2);
            svgEl('polygon', { points: '142,82 116,94 152,282 184,272', fill: 'transparent', class: 'hz-hit' }, g);
        },
        left_leg: function (g) {
            boneLine(g, 86, 265, 81, 330, 5);   // femore
            joint(g, 81, 332, 4.5);             // ginocchio
            boneLine(g, 81, 336, 78, 398, 3.5); // tibia
            boneLine(g, 86, 338, 83, 396, 2);   // perone
            joint(g, 79, 400, 3);
            boneLine(g, 78, 402, 64, 407, 2.5); // piede
            svgEl('polygon', { points: '70,258 98,258 92,414 56,414', fill: 'transparent', class: 'hz-hit' }, g);
        },
        right_leg: function (g) {
            boneLine(g, 114, 265, 119, 330, 5);
            joint(g, 119, 332, 4.5);
            boneLine(g, 119, 336, 122, 398, 3.5);
            boneLine(g, 114, 338, 117, 396, 2);
            joint(g, 121, 400, 3);
            boneLine(g, 122, 402, 136, 407, 2.5);
            svgEl('polygon', { points: '102,258 130,258 144,414 108,414', fill: 'transparent', class: 'hz-hit' }, g);
        },
    };

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

    function buildZone(svg, zoneKey) {
        const g = svgEl('g', { class: 'health-zone', 'data-hzone': zoneKey }, svg);

        const zoneDef = data && data.zones ? data.zones[zoneKey] : null;
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = zoneDef ? zoneDef.label : zoneKey;
        g.appendChild(title);

        if (ZONE_BUILDERS[zoneKey]) ZONE_BUILDERS[zoneKey](g);
        if (ZONE_DROPS[zoneKey]) g.appendChild(createDropletElement(ZONE_DROPS[zoneKey]));
        return g;
    }

    function buildSVG() {
        const container = document.getElementById('health-svg-container');
        if (!container) return;

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 200 420');
        svg.setAttribute('class', 'health-svg');
        svg.id = 'health-svg';

        buildGrid(svg);
        buildFlesh(svg);

        // Organi interni (sotto la gabbia toracica)
        for (const zoneKey of ORGAN_ZONES) buildZone(svg, zoneKey);

        // Scheletro decorativo (costole sopra i polmoni = effetto raggi X)
        buildSkeletonDecor(svg);

        // Testa e arti (ossa colorabili)
        for (const zoneKey of OUTER_ZONES) buildZone(svg, zoneKey);

        container.innerHTML = '';
        container.appendChild(svg);
    }

    // ============================================
    // RENDER STATO
    // ============================================

    // Livello complessivo della zona: 0 = sana (bianca), 1 = gialla, 2 = rossa
    function zoneLevel(zoneKey) {
        let level = 0;
        const fr = fractures[zoneKey];
        if (fr) level = Math.max(level, fr === 'grave' ? 2 : 1);
        const bl = bleedings[zoneKey];
        if (bl) level = Math.max(level, bl === 'heavy' ? 2 : 1);
        const org = organs[zoneKey];
        if (org) level = Math.max(level, org === 'media' ? 1 : 2);
        return level;
    }

    function renderZones() {
        document.querySelectorAll('.health-zone').forEach(function (g) {
            const zoneKey = g.dataset.hzone;

            // Colore zona: bianca sana, gialla o rossa per gravita'
            g.classList.remove('hz-yellow', 'hz-red');
            const level = zoneLevel(zoneKey);
            if (level === 1) g.classList.add('hz-yellow');
            else if (level === 2) g.classList.add('hz-red');

            // Sanguinamento: goccia colorata accanto alla zona
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
            const orgSev = organs[zoneKey];

            // Gli organi compaiono solo se hanno una condizione
            if (!zoneDef.breakable && !frSev && !blSev && !orgSev) continue;

            const row = document.createElement('div');
            let rowClass = 'health-row';
            if (blSev === 'heavy' || frSev === 'grave' || (orgSev && orgSev !== 'media')) {
                rowClass += ' health-row-grave';
            } else if (blSev || frSev || orgSev) {
                rowClass += ' health-row-media';
            }
            row.className = rowClass;

            const name = document.createElement('span');
            name.className = 'health-row-name';
            name.textContent = zoneDef.label;
            row.appendChild(name);

            const statusWrap = document.createElement('span');
            statusWrap.className = 'health-row-statuses';

            if (!frSev && !blSev && !orgSev) {
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
                if (orgSev) {
                    const orgEl = document.createElement('span');
                    orgEl.className = 'health-row-status hs-organ-' +
                        (orgSev === 'media' ? 'media' : 'grave');
                    const labels = data.organLabels && data.organLabels[zoneKey];
                    orgEl.textContent = (labels && labels[orgSev]) || orgSev;
                    statusWrap.appendChild(orgEl);
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
        organs = data.organs || {};
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

    function update(newFractures, newBleedings, newBlood, newHunger, newThirst, newOrgans) {
        fractures = newFractures || {};
        bleedings = newBleedings || {};
        organs = newOrgans || {};
        if (typeof newBlood === 'number') blood = newBlood;
        if (typeof newHunger === 'number') hunger = newHunger;
        if (typeof newThirst === 'number') thirst = newThirst;
        if (isOpen) render();
    }

    // ============================================
    // DRAG & DROP (chiamato da drag.js)
    // ============================================

    // Ritorna 'splint' | 'tourniquet' | 'bloodbag' | 'surgery' | null per un item
    function treatmentKindFor(itemName) {
        if (!data) return null;
        if (data.splints && data.splints[itemName]) return 'splint';
        if (data.tourniquets && data.tourniquets[itemName]) return 'tourniquet';
        if (data.bloodBags && data.bloodBags[itemName]) return 'bloodbag';
        if (data.surgeryKits && data.surgeryKits[itemName]) return 'surgery';
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
        if (kind === 'surgery') {
            return !!organs[zoneKey];
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
        else if (kind === 'surgery') cfgSource = data.surgeryKits;
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
