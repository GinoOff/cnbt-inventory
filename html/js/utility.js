/**
 * CNBT Inventory - Utility Panel (tabbed: Vestiario / Salute)
 *
 * Chrome-style tabs on the left panel:
 *   - VESTIARIO: equipment slots (casco, zaino, giubbotto, paracadute),
 *     interactive SVG body for toggling clothing, backpack grid. Helmet
 *     and vest items are equipped by dragging them from the inventory
 *     onto their slot or onto the stickman (head / torso).
 *   - SALUTE: medical stickman + bars (see health.js).
 */

'use strict';

window.UtilityPanel = (function () {
    let isOpen = false;
    let activeTab = 'clothing';

    // Body parts the player can click to toggle clothing
    const BODY_ZONES = [
        { id: 'head',      label: 'Cappello',    component: 'hat' },
        { id: 'face',      label: 'Maschera',    component: 'mask' },
        { id: 'neck',      label: 'Collana',     component: 'chain' },
        { id: 'torso',     label: 'Giacca',      component: 'torso' },
        { id: 'undershirt',label: 'Maglia',      component: 'undershirt' },
        { id: 'legs',      label: 'Pantaloni',   component: 'legs' },
        { id: 'feet',      label: 'Scarpe',      component: 'shoes' },
        { id: 'hands',     label: 'Guanti',      component: 'gloves' },
        { id: 'glasses',   label: 'Occhiali',    component: 'glasses' },
        { id: 'ears',      label: 'Orecchie',    component: 'ears' },
    ];

    // Zone of the body SVG that accept gear drops: slot -> zone id
    const GEAR_DROP_ZONES = { helmet: 'head', vest: 'torso' };

    // Toggled-off components (set of component names)
    const toggledOff = new Set();

    // Currently equipped gear: { helmet: {name, metadata}|null, vest: ... }
    let equipment = {};

    // ============================================
    // TABS (chrome-style)
    // ============================================

    function switchTab(tab) {
        if (tab !== 'clothing' && tab !== 'health') return;
        activeTab = tab;

        document.querySelectorAll('.utility-tab').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        const clothingEl = document.getElementById('utility-tab-clothing');
        const healthEl = document.getElementById('utility-tab-health');
        if (clothingEl) clothingEl.classList.toggle('hidden', tab !== 'clothing');
        if (healthEl) healthEl.classList.toggle('hidden', tab !== 'health');

        if (tab === 'health' && window.HealthPanel) {
            window.HealthPanel.refresh();
        }
    }

    function getActiveTab() {
        return activeTab;
    }

    // ============================================
    // BODY SVG (clothing tab)
    // ============================================

    function buildSVG() {
        const container = document.getElementById('body-svg-container');
        if (!container) return;

        // Interactive SVG human figure with clickable zones
        // Each zone has a data-zone attribute for identifying clicks
        const svgNS = 'http://www.w3.org/2000/svg';

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 200 420');
        svg.setAttribute('class', 'body-svg');
        svg.id = 'body-svg';

        // Grid background lines
        const gridG = document.createElementNS(svgNS, 'g');
        gridG.setAttribute('class', 'body-grid');
        gridG.setAttribute('opacity', '0.08');
        for (let x = 0; x <= 200; x += 20) {
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', x); line.setAttribute('y1', 0);
            line.setAttribute('x2', x); line.setAttribute('y2', 420);
            line.setAttribute('stroke', 'var(--accent)');
            line.setAttribute('stroke-width', '0.5');
            gridG.appendChild(line);
        }
        for (let y = 0; y <= 420; y += 20) {
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', 0); line.setAttribute('y1', y);
            line.setAttribute('x2', 200); line.setAttribute('y2', y);
            line.setAttribute('stroke', 'var(--accent)');
            line.setAttribute('stroke-width', '0.5');
            gridG.appendChild(line);
        }
        svg.appendChild(gridG);

        // Body outline group (the orange silhouette)
        const bodyG = document.createElementNS(svgNS, 'g');
        bodyG.setAttribute('class', 'body-outline');

        // Full body outline path (simplified human form)
        const outline = document.createElementNS(svgNS, 'path');
        outline.setAttribute('d', UtilityPanel.BODY_OUTLINE_PATH);
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', 'var(--accent)');
        outline.setAttribute('stroke-width', '2');
        outline.setAttribute('stroke-linejoin', 'round');
        outline.setAttribute('class', 'body-path');
        bodyG.appendChild(outline);
        svg.appendChild(bodyG);

        // Clickable zone overlays (invisible hit areas)
        const zonesG = document.createElementNS(svgNS, 'g');
        zonesG.setAttribute('class', 'body-zones');

        const zonePaths = {
            head:       { type: 'ellipse', cx: 100, cy: 48, rx: 28, ry: 32 },
            face:       { type: 'ellipse', cx: 100, cy: 52, rx: 20, ry: 18 },
            neck:       { type: 'rect', x: 85, y: 75, w: 30, h: 18 },
            torso:      { type: 'rect', x: 55, y: 93, w: 90, h: 80 },
            undershirt: { type: 'rect', x: 65, y: 170, w: 70, h: 50 },
            legs:       { type: 'rect', x: 58, y: 265, w: 84, h: 100 },
            feet:       { type: 'rect', x: 58, y: 385, w: 84, h: 25 },
            hands:      { type: 'rect', x: 40, y: 270, w: 20, h: 30 },
            glasses:    { type: 'rect', x: 82, y: 38, w: 36, h: 14 },
            ears:       { type: 'rect', x: 70, y: 40, w: 60, h: 15 },
        };

        for (const zone of BODY_ZONES) {
            const zDef = zonePaths[zone.id];
            if (!zDef) continue;

            let el;
            if (zDef.type === 'ellipse') {
                el = document.createElementNS(svgNS, 'ellipse');
                el.setAttribute('cx', zDef.cx);
                el.setAttribute('cy', zDef.cy);
                el.setAttribute('rx', zDef.rx);
                el.setAttribute('ry', zDef.ry);
            } else {
                el = document.createElementNS(svgNS, 'rect');
                el.setAttribute('x', zDef.x);
                el.setAttribute('y', zDef.y);
                el.setAttribute('width', zDef.w);
                el.setAttribute('height', zDef.h);
                el.setAttribute('rx', '4');
            }
            el.setAttribute('class', 'body-zone');
            el.setAttribute('data-zone', zone.id);
            el.setAttribute('data-component', zone.component);

            // Tooltip on hover
            const titleEl = document.createElementNS(svgNS, 'title');
            titleEl.textContent = zone.label;
            el.appendChild(titleEl);

            el.addEventListener('click', function () {
                toggleClothing(zone);
            });

            el.addEventListener('mouseenter', function () {
                el.classList.add('zone-hover');
            });
            el.addEventListener('mouseleave', function () {
                el.classList.remove('zone-hover');
            });

            zonesG.appendChild(el);
        }
        svg.appendChild(zonesG);

        container.innerHTML = '';
        container.appendChild(svg);
    }

    function toggleClothing(zone) {
        const el = document.querySelector('#body-svg [data-zone="' + zone.id + '"]');
        if (!el) return;

        if (toggledOff.has(zone.component)) {
            toggledOff.delete(zone.component);
            el.classList.remove('zone-off');
        } else {
            toggledOff.add(zone.component);
            el.classList.add('zone-off');
        }

        // Send to NUI -> Lua client
        if (window.CNBT && window.CNBT.nuiCallback) {
            window.CNBT.nuiCallback('toggleClothing', {
                component: zone.component,
                visible: !toggledOff.has(zone.component),
            });
        }
    }

    // ============================================
    // OPEN / CLOSE
    // ============================================

    function open() {
        const panel = document.getElementById('utility-panel');
        if (!panel) return;
        panel.classList.remove('hidden');
        isOpen = true;
        buildSVG();
        renderGearSlots();
        if (window.HealthPanel) window.HealthPanel.build();
        switchTab(activeTab);
    }

    function close() {
        const panel = document.getElementById('utility-panel');
        if (!panel) return;
        panel.classList.add('hidden');
        isOpen = false;
    }

    function toggle() {
        if (isOpen) close();
        else open();
    }

    // ============================================
    // EQUIPMENT SLOT RENDERING
    // ============================================

    function renderEquipSlot(slotId, item, def) {
        const el = document.getElementById(slotId);
        if (!el) return;
        el.innerHTML = '';

        if (item) {
            const wrap = document.createElement('div');
            wrap.className = 'equip-slot-item';

            if (def && def.image) {
                const img = new Image();
                img.src = 'img/' + def.image;
                img.className = 'equip-slot-img';
                img.onerror = function () { this.style.display = 'none'; };
                wrap.appendChild(img);
            }

            const label = document.createElement('span');
            label.className = 'equip-slot-item-label';
            label.textContent = def ? def.label : item.name;
            wrap.appendChild(label);

            el.appendChild(wrap);
        } else {
            const ph = document.createElement('span');
            ph.className = 'equip-slot-placeholder';
            el.appendChild(ph);
        }
    }

    // ============================================
    // GEAR (casco / giubbotto)
    // ============================================

    function setEquipment(eq) {
        equipment = eq || {};
        if (isOpen) renderGearSlots();
    }

    function getEquipment() {
        return equipment;
    }

    function renderGearSlots() {
        renderGearSlot('helmet', 'equip-helmet');
        renderGearSlot('vest', 'equip-vest');
    }

    function renderGearSlot(slot, slotId) {
        const el = document.getElementById(slotId);
        if (!el) return;

        const item = equipment && equipment[slot];
        const def = item && window.CNBT ? window.CNBT.getItemDef(item.name) : null;

        renderEquipSlot(slotId, item, def);

        if (item) {
            // Durability badge (vests)
            if (item.metadata && item.metadata.durability != null) {
                const badge = document.createElement('span');
                badge.className = 'equip-slot-badge';
                badge.textContent = item.metadata.durability;
                el.appendChild(badge);
            }

            // Right click to unequip
            el.oncontextmenu = function (e) {
                e.preventDefault();
                if (window.CNBT && window.CNBT.showContextMenu) {
                    window.CNBT.showContextMenu(e.clientX, e.clientY, [
                        {
                            label: slot === 'helmet' ? 'Togli Casco' : 'Togli Giubbotto',
                            action: function () {
                                window.CNBT.nuiCallback('unequipGear', { slot: slot });
                            },
                        },
                    ]);
                } else {
                    window.CNBT.nuiCallback('unequipGear', { slot: slot });
                }
            };
        } else {
            el.oncontextmenu = null;
        }
    }

    // Zona del body SVG che accetta il drop di un item gear (slot: 'helmet'|'vest')
    function getGearZoneElement(slot) {
        const zoneId = GEAR_DROP_ZONES[slot];
        if (!zoneId) return null;
        if (activeTab !== 'clothing' || !isOpen) return null;
        return document.querySelector('#body-svg [data-zone="' + zoneId + '"]');
    }

    // True se il punto (x, y) cade sulla zona del corpo che accetta questo slot
    function isPointOnGearZone(slot, x, y) {
        const el = getGearZoneElement(slot);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function highlightGearZone(slot, on) {
        const el = getGearZoneElement(slot);
        if (!el) return;
        el.classList.toggle('zone-gear-drop', !!on);
    }

    function clearGearZoneHighlights() {
        document.querySelectorAll('#body-svg .zone-gear-drop').forEach(function (el) {
            el.classList.remove('zone-gear-drop');
        });
    }

    // Reset clothing toggles (when inventory opens fresh)
    function resetToggles() {
        toggledOff.clear();
        document.querySelectorAll('.body-zone.zone-off').forEach(function (el) {
            el.classList.remove('zone-off');
        });
    }

    // Init: wire the toggle button + tabs
    document.addEventListener('DOMContentLoaded', function () {
        const btn = document.getElementById('utility-toggle-btn');
        if (btn) {
            btn.addEventListener('click', toggle);
        }
        document.querySelectorAll('.utility-tab').forEach(function (tabBtn) {
            tabBtn.addEventListener('click', function () {
                switchTab(tabBtn.dataset.tab);
            });
        });
    });

    return {
        open: open,
        close: close,
        toggle: toggle,
        isOpen: function () { return isOpen; },
        renderEquipSlot: renderEquipSlot,
        resetToggles: resetToggles,
        buildSVG: buildSVG,
        switchTab: switchTab,
        getActiveTab: getActiveTab,
        setEquipment: setEquipment,
        getEquipment: getEquipment,
        renderGearSlots: renderGearSlots,
        isPointOnGearZone: isPointOnGearZone,
        highlightGearZone: highlightGearZone,
        clearGearZoneHighlights: clearGearZoneHighlights,
        // Path della silhouette, riusato anche dallo stickman della scheda Salute
        BODY_OUTLINE_PATH:
            // Head
            'M100,18 ' +
            'C115,18 126,30 126,48 C126,66 115,78 100,78 C85,78 74,66 74,48 C74,30 85,18 100,18 Z ' +
            // Neck
            'M90,78 L90,90 L110,90 L110,78 ' +
            // Shoulders and torso
            'M110,90 L140,100 Q155,105 155,118 L155,200 ' +
            // Right arm
            'L155,200 Q158,220 152,240 L145,270 Q140,285 142,295 L142,295 ' +
            'L130,295 Q132,285 135,270 L140,245 Q145,225 142,210 ' +
            // Right side torso to hips
            'L142,210 L140,230 L135,260 ' +
            // Right leg
            'L138,300 L140,340 L142,370 Q143,385 138,395 L138,405 ' +
            'L115,405 L115,395 L118,380 L120,340 L118,300 ' +
            // Crotch
            'L115,270 L100,265 L85,270 ' +
            // Left leg
            'L82,300 L80,340 L85,380 L85,395 L85,405 ' +
            'L62,405 L62,395 Q57,385 58,370 L60,340 L62,300 ' +
            // Left side torso
            'L65,260 L60,230 L58,210 ' +
            // Left arm
            'Q55,225 60,245 L65,270 Q68,285 70,295 ' +
            'L58,295 Q60,285 55,270 L48,240 Q42,220 45,200 ' +
            // Left shoulder
            'L45,118 Q45,105 60,100 L90,90',
    };
})();
