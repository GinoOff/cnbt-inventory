/**
 * CNBT Inventory - Gunsmith Panel
 *
 * Floating draggable window with:
 *  - Three.js 3D weapon model (rotatable via OrbitControls)
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

    // Three.js
    var renderer = null;
    var scene = null;
    var camera = null;
    var controls = null;
    var weaponModel = null;
    var animFrameId = null;
    var threeInited = false;

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
            win.style.left = Math.max(20, (ww / 2 - 400)) + 'px';
            win.style.top = Math.max(20, (wh / 2 - 280)) + 'px';
            win.dataset.positioned = '1';
        }

        // Title
        var titleEl = document.getElementById('gunsmith-title');
        titleEl.textContent = weaponLabel || weaponName || '';

        renderSlots();
        initThreeJS();
        loadWeaponModel(weaponName);
    }

    function close() {
        if (!isOpenState) return;
        isOpenState = false;

        var win = document.getElementById('gunsmith-window');
        win.classList.add('hidden');

        clearSlotHighlights();
        disposeThreeJS();
    }

    function nuiCallback(name, data) {
        fetch('https://cnbt-inventory/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        }).catch(function () {});
    }

    // ============================================
    // THREE.JS 3D VIEWER
    // ============================================

    function initThreeJS() {
        if (typeof THREE === 'undefined') return;

        var viewport = document.getElementById('gunsmith-3d-viewport');
        var w = viewport.clientWidth;
        var h = viewport.clientHeight;

        if (w === 0 || h === 0) {
            // Retry after layout
            setTimeout(function () { initThreeJS(); }, 50);
            return;
        }

        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111111);

        // Subtle gradient feel
        var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(2, 3, 4);
        scene.add(dirLight);

        var backLight = new THREE.DirectionalLight(0x4a9eff, 0.3);
        backLight.position.set(-2, -1, -3);
        scene.add(backLight);

        // Camera
        camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 100);
        camera.position.set(0, 0.1, 0.6);

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;

        // Remove any existing canvas
        var existingCanvas = viewport.querySelector('canvas');
        if (existingCanvas) existingCanvas.remove();

        viewport.insertBefore(renderer.domElement, viewport.firstChild);

        // Hide fallback image
        var fallback = document.getElementById('gunsmith-weapon-fallback');
        if (fallback) fallback.style.display = 'none';

        // OrbitControls (rotate only, no pan/zoom)
        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableZoom = false;
            controls.enablePan = false;
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.rotateSpeed = 0.6;
            controls.autoRotate = true;
            controls.autoRotateSpeed = 1.0;
            controls.target.set(0, 0, 0);
            controls.update();
        }

        threeInited = true;
        startRenderLoop();
    }

    function startRenderLoop() {
        function animate() {
            if (!threeInited) return;
            animFrameId = requestAnimationFrame(animate);
            if (controls) controls.update();
            if (renderer && scene && camera) renderer.render(scene, camera);
        }
        animate();
    }

    function disposeThreeJS() {
        threeInited = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        if (controls) { controls.dispose(); controls = null; }
        if (weaponModel) {
            scene.remove(weaponModel);
            weaponModel.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function (m) { m.dispose(); });
                    } else {
                        child.material.dispose();
                    }
                }
            });
            weaponModel = null;
        }
        if (renderer) {
            renderer.dispose();
            var canvas = renderer.domElement;
            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
            renderer = null;
        }
        scene = null;
        camera = null;
    }

    function loadWeaponModel(name) {
        if (!threeInited || !scene) return;

        // Remove previous model
        if (weaponModel) {
            scene.remove(weaponModel);
            weaponModel = null;
        }

        var modelPath = 'models/' + name + '.glb';

        if (typeof THREE.GLTFLoader === 'undefined') {
            showFallbackImage(name);
            return;
        }

        var loader = new THREE.GLTFLoader();
        loader.load(
            modelPath,
            function (gltf) {
                weaponModel = gltf.scene;

                // Auto-center and scale
                var box = new THREE.Box3().setFromObject(weaponModel);
                var center = box.getCenter(new THREE.Vector3());
                var size = box.getSize(new THREE.Vector3());
                var maxDim = Math.max(size.x, size.y, size.z);
                var scale = 0.3 / maxDim;
                weaponModel.scale.setScalar(scale);
                weaponModel.position.sub(center.multiplyScalar(scale));

                scene.add(weaponModel);

                // Hide fallback
                var fallback = document.getElementById('gunsmith-weapon-fallback');
                if (fallback) fallback.style.display = 'none';
            },
            undefined,
            function () {
                // Model not found - show fallback image
                showFallbackImage(name);
            }
        );
    }

    function showFallbackImage(name) {
        var fallback = document.getElementById('gunsmith-weapon-fallback');
        var def = window.CNBT ? window.CNBT.getItemDef(name) : null;
        if (fallback && def && def.image) {
            fallback.src = 'img/' + def.image;
            fallback.style.display = '';
        }
        // Hide Three.js canvas if present
        var viewport = document.getElementById('gunsmith-3d-viewport');
        var canvas = viewport ? viewport.querySelector('canvas') : null;
        if (canvas) canvas.style.display = 'none';
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
            if (e.target.closest('.gs-close-btn')) return; // don't drag on close button
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
            // Clamp to screen
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
