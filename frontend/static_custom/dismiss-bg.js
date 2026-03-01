// dismiss-bg.js - Quartz port of the "current working fire" ember particle background.
// Warm ember/ash particles falling with drift, rendered on a fixed canvas behind all content.
(function () {
    // Track the active RAF id and renderer so we can tear them down before re-init.
    var _rafId   = null;
    var _renderer = null;

    function destroyExisting() {
        // Stop the animation loop
        if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
        // Dispose the WebGL renderer and remove its canvas
        if (_renderer) {
            try { _renderer.dispose(); } catch(e) {}
            _renderer = null;
        }
        var old = document.getElementById('dismiss-bg-canvas');
        if (old) old.parentNode.removeChild(old);
    }

    // Tuning knobs (matching original)
    var PARTICLE_COUNT       = 2000;
    var PARTICLE_SPREAD      = 5;
    var PARTICLE_SIZE        = 0.005;
    var SMALL_PARTICLE_RATIO = 0.05;
    var SPEED_FACTOR         = 0.05;

    function injectThree(callback) {
        if (window.THREE) { callback(); return; }
        var s = document.createElement('script');
        s.src = '/static/static_custom/three.min.js';
        s.onload = callback;
        s.onerror = function () {
            console.error('[dismiss-bg] Failed to load /static/js/three.min.js');
        };
        document.head.appendChild(s);
    }

    function setup() {
        destroyExisting();

        var c = document.createElement('canvas');
        c.id = 'dismiss-bg-canvas';
        c.style.position = 'fixed';
        c.style.left = '0';
        c.style.top = '0';
        c.style.width = '100vw';
        c.style.height = '100vh';
        c.style.pointerEvents = 'none';
        c.style.zIndex = '0';
        document.body.insertBefore(c, document.body.firstChild);

        injectThree(function () { boot(c); });
    }

    function boot(canvas) {
        var T = window.THREE;
        var scene = new T.Scene();

        var sz = { w: window.innerWidth, h: window.innerHeight };
        var cam = new T.PerspectiveCamera(75, sz.w / sz.h, 0.1, 100);
        cam.position.z = 2;
        scene.add(cam);

        var ren = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
        _renderer = ren;
        ren.setSize(sz.w, sz.h);
        ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        ren.setClearColor(0x000000, 0);

        // --- Sprite 1: small ember (round radial gradient, warm core) ---
        var spriteSize = 64;
        var tc = document.createElement('canvas');
        tc.width = spriteSize; tc.height = spriteSize;
        var ctx = tc.getContext('2d');
        var cx = spriteSize / 2, cy = spriteSize / 2, r = spriteSize / 2;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,    'rgba(255,220,160,1)');
        g.addColorStop(0.35, 'rgba(255,140,60,0.7)');
        g.addColorStop(1,    'rgba(255,80,0,0)');
        ctx.clearRect(0, 0, spriteSize, spriteSize);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

        // overlay random blobs to break perfect circular symmetry
        var blobs = 4 + Math.floor(Math.random() * 5);
        for (var b = 0; b < blobs; b++) {
            var bx = cx + (Math.random() - 0.5) * spriteSize * 0.45;
            var by = cy + (Math.random() - 0.5) * spriteSize * 0.45;
            var br = (0.12 + Math.random() * 0.5) * r;
            var a  = 0.2 + Math.random() * 0.6;
            var gg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            gg.addColorStop(0,   'rgba(255,200,140,' + a + ')');
            gg.addColorStop(0.6, 'rgba(255,120,60,' + (a * 0.6) + ')');
            gg.addColorStop(1,   'rgba(255,80,0,0)');
            ctx.fillStyle = gg;
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        }
        var tex = new T.CanvasTexture(tc);

        // --- Sprite 2: larger ember (slightly squashed, brighter highlight) ---
        var tc2  = document.createElement('canvas');
        tc2.width = spriteSize; tc2.height = spriteSize;
        var ctx2 = tc2.getContext('2d');
        ctx2.clearRect(0, 0, spriteSize, spriteSize);
        ctx2.save();
        ctx2.translate(spriteSize / 2, spriteSize / 2);
        ctx2.scale(1.0, 0.8);
        var gg2 = ctx2.createRadialGradient(0, 0, 0, 0, 0, r);
        gg2.addColorStop(0,    'rgba(255,230,180,1)');
        gg2.addColorStop(0.35, 'rgba(255,150,80,0.8)');
        gg2.addColorStop(1,    'rgba(255,90,30,0)');
        ctx2.fillStyle = gg2;
        ctx2.beginPath(); ctx2.arc(0, 0, r, 0, Math.PI * 2); ctx2.fill();
        ctx2.restore();
        ctx2.globalCompositeOperation = 'lighter';
        ctx2.beginPath();
        ctx2.fillStyle = 'rgba(255,200,120,0.45)';
        ctx2.ellipse(spriteSize * 0.6, spriteSize * 0.35, r * 0.5, r * 0.3, -0.6, 0, Math.PI * 2);
        ctx2.fill();
        var texLarge = new T.CanvasTexture(tc2);

        // --- Particle layers ---
        var layerSmallCount = Math.max(0, Math.floor(PARTICLE_COUNT * SMALL_PARTICLE_RATIO));
        var layerLargeCount = Math.max(0, PARTICLE_COUNT - layerSmallCount);

        function createLayer(count, sizeWorld, speedRange, texture) {
            var positions  = new Float32Array(count * 3);
            var velocities = new Float32Array(count * 3);
            var phases     = new Float32Array(count);
            for (var i = 0; i < count; i++) {
                positions[i * 3]     = (Math.random() - 0.5) * PARTICLE_SPREAD;
                positions[i * 3 + 1] = (Math.random() - 0.5) * PARTICLE_SPREAD;
                positions[i * 3 + 2] = (Math.random() - 0.5) * PARTICLE_SPREAD;
                var v = (Math.random() * (speedRange[1] - speedRange[0])) + speedRange[0];
                velocities[i * 3]     = ((Math.random() - 0.5) * 0.002) * SPEED_FACTOR;
                velocities[i * 3 + 1] = -Math.abs(v) * SPEED_FACTOR;
                velocities[i * 3 + 2] = ((Math.random() - 0.5) * 0.002) * SPEED_FACTOR;
                phases[i] = Math.random() * Math.PI * 2;
            }
            var geometry = new T.BufferGeometry();
            geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
            var material = new T.PointsMaterial({
                size: sizeWorld,
                map: texture,
                transparent: true,
                depthWrite: false,
                color: 0xffffff,
            });
            var points = new T.Points(geometry, material);
            points.userData = { velocities: velocities, phases: phases, count: count };
            scene.add(points);
            return points;
        }

        var ptsSmall = createLayer(layerSmallCount, PARTICLE_SIZE * 0.85, [0.00012, 0.0004],  tex);
        var ptsLarge = createLayer(layerLargeCount, PARTICLE_SIZE * 1.6,  [0.00035, 0.0009], texLarge);

        window.addEventListener('resize', function () {
            sz.w = window.innerWidth;
            sz.h = window.innerHeight;
            cam.aspect = sz.w / sz.h;
            cam.updateProjectionMatrix();
            ren.setSize(sz.w, sz.h);
            ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        });

        var clock = new T.Clock();

        function updateLayer(points, dt, driftAmt) {
            var attr   = points.geometry.getAttribute('position');
            var arr    = attr.array;
            var vel    = points.userData.velocities;
            var phases = points.userData.phases;
            var cnt    = points.userData.count;
            var half   = PARTICLE_SPREAD * 0.5;
            var t      = clock.getElapsedTime();
            for (var i = 0, j = 0; i < cnt; i++, j += 3) {
                arr[j]     += vel[j]     * dt;
                arr[j + 1] += vel[j + 1] * dt;
                arr[j + 2] += vel[j + 2] * dt;
                var phase = phases[i];
                arr[j]     += Math.sin(phase + t * 0.2) * driftAmt * dt;
                arr[j + 2] += Math.cos(phase + t * 0.15) * driftAmt * 0.3 * dt;
                // wrap: respawn near top when fallen below bottom
                if (arr[j + 1] < -half) {
                    arr[j + 1] = half + (Math.random() - 0.5) * 0.2;
                    arr[j]     = (Math.random() - 0.5) * PARTICLE_SPREAD;
                    arr[j + 2] = (Math.random() - 0.5) * PARTICLE_SPREAD;
                }
            }
            attr.needsUpdate = true;
        }

        (function tick() {
            var dt = Math.min(0.05, clock.getDelta());
            var t  = clock.getElapsedTime();
            try {
                if (ptsSmall) updateLayer(ptsSmall, dt, 0.6 * SPEED_FACTOR);
                if (ptsLarge) updateLayer(ptsLarge, dt, 0.9 * SPEED_FACTOR);
            } catch (e) { /* keep running on error */ }

            if (ptsSmall) {
                ptsSmall.rotation.y =  0.003 * t * SPEED_FACTOR;
                ptsSmall.rotation.x =  0.002 * t * SPEED_FACTOR;
            }
            if (ptsLarge) {
                ptsLarge.rotation.y = -0.0025 * t * SPEED_FACTOR;
                ptsLarge.rotation.x =  0.001  * t * SPEED_FACTOR;
            }

            ren.render(scene, cam);
            _rafId = requestAnimationFrame(tick);
        })();
    }

    // Initial load — single init, NoteDiscovery is not a multi-page SPA
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
