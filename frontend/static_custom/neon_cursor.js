// neon_cursor.js — Quartz port of the code-server neon cursor effect.
// ES module — loaded with <script type="module">.
// Depends on: threejs-toys.module.cdn.min.js + three.module.js (both in /static/js/)
import { neonCursor } from '/static/static_custom/threejs-toys.module.cdn.min.js';

// Hold a reference to the destroy function returned by neonCursor()
// so we can tear down the old instance before creating a new one.
let _destroy = null;

function initNeonCursor() {
  // Tear down previous instance (stops its RAF loop and removes its canvas)
  if (_destroy) { try { _destroy(); } catch(e) {} _destroy = null; }

  // Remove any leftover overlay element
  document.getElementById('app-neon-overlay')?.remove();

  // Create the full-viewport overlay that threejs-toys renders into.
  // Must be position:fixed and cover the full viewport BEFORE neonCursor reads its size.
  // Start opacity:0 — reveal after first RAF so the WebGL canvas is transparent
  // before it becomes visible (avoids a black-flash on init).
  const overlay = document.createElement('div');
  overlay.id = 'app-neon-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:100vw',
    'height:100vh',
    'pointer-events:none',
    'z-index:9999',
    'overflow:hidden',
    'opacity:0',
    'transition:opacity 0.3s ease',
    'background:transparent',
  ].join(';');
  document.body.appendChild(overlay);

  // Force layout flush so overlay has correct clientWidth/clientHeight
  void overlay.clientWidth;

  // Proxy object passed as eventsEl: delegates event listeners to document
  // (so clicks pass through normally) but returns viewport-sized getBoundingClientRect
  // (so pointer coordinates normalize correctly against the WebGL viewport).
  const eventsProxy = {
    addEventListener:    (t, fn, o) => document.addEventListener(t, fn, o),
    removeEventListener: (t, fn, o) => document.removeEventListener(t, fn, o),
    getBoundingClientRect: () => ({
      left: 0, top: 0,
      width: window.innerWidth, height: window.innerHeight,
      right: window.innerWidth, bottom: window.innerHeight,
    }),
  };

  _destroy = neonCursor({
    el: overlay,
    eventsEl: eventsProxy,
    resize: 'window',
    alpha: true,
    // Explicitly clear to fully transparent so the canvas never shows black
    initRenderer(o) {
      o.renderer.setClearColor(0x000000, 0);
      o.renderer.domElement.style.background = 'transparent';
    },
    shaderPoints: 16,
    curvePoints: 80,
    curveLerp: 0.5,
    radius1: 2,
    radius2: 2,
    velocityTreshold: 10,
    sleepRadiusX: 50,
    sleepRadiusY: 50,
    sleepTimeCoefX: 0.0025,
    sleepTimeCoefY: 0.0025,
  });

  // After neonCursor appends its canvas, position it absolutely at top-left.
  // Do NOT set CSS width/height — keep the canvas at its native pixel dimensions
  // so the WebGL coordinate system maps 1:1 to screen pixels.
  const canvas = overlay.querySelector('canvas');
  if (canvas) {
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
  }

  // Reveal after two animation frames — by then the WebGL context has cleared
  // to transparent, so there's no black-flash when it becomes visible.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  }));
}

// Initial load — single init, NoteDiscovery is not a multi-page SPA
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNeonCursor);
} else {
  initNeonCursor();
}
