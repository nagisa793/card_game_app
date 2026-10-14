// The original engine, renderer, phase timers and pointer handlers stay intact.
// Only the WEB app viewport and browser lifecycle are handled here.
const body = document.body;
const stage = document.getElementById('battleStage');
const menus = [];
let fittedArena;
// CSS dynamic viewport units describe the complete display area. In Safari's
// installed mode visualViewport can already exclude the safe-area insets.
const viewportProbe = document.createElement('div');
viewportProbe.id = 'appViewportProbe';
viewportProbe.setAttribute('aria-hidden', 'true');
body.append(viewportProbe);
let lastViewport;
let lastSafeArea;
let resizeQueued = false;
let settlingTimers = [];

function compactMenu(container, panel, id, label) {
  panel.id = id;
  panel.classList.add('appMenuPanel');
  panel.hidden = true;
  const toggle = document.createElement('button');
  toggle.id = id + 'Toggle';
  toggle.type = 'button';
  toggle.className = 'appMenuToggle';
  toggle.setAttribute('aria-controls', id);
  // Draw the marker as a vector; its appearance never depends on emoji fonts.
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.classList.add('appMenuArrow');
  arrow.setAttribute('viewBox', '0 0 32 32');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.setAttribute('focusable', 'false');
  const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  triangle.setAttribute('d', 'M21 7 L9 16 L21 25 Z');
  arrow.append(triangle);
  toggle.append(arrow);
  const setOpen = open => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', label + (open ? 'を閉じる' : 'を開く'));
  };
  setOpen(false);
  container.append(toggle);
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    for (const menu of menus) menu.setOpen(false);
    setOpen(open);
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button && !button.disabled) setOpen(false);
  }, { capture: true });
  menus.push({ container, panel, toggle, setOpen });
}

// Move the original controls, retaining their IDs, listeners, disabled states,
// and the spectator pause button. No duplicate game actions are created.
function prepareAppLayout() {
  const bar = document.querySelector('.top-bar');
  if (bar && !document.getElementById('appTopMenu')) {
    const panel = bar.querySelector(':scope > div');
    if (panel) compactMenu(bar, panel, 'appTopMenu', 'ゲームメニュー');
  }
  const dock = stage?.querySelector('.boardDock');
  if (dock && !document.getElementById('appBottomMenu')) {
    const panel = document.createElement('div');
    panel.append(...dock.children);
    dock.append(panel);
    compactMenu(dock, panel, 'appBottomMenu', '操作・履歴メニュー');
  }
  const phase = document.querySelector('.metaBar');
  if (phase && stage && phase.parentElement !== stage) stage.append(phase);

  const arena = window.DuelArena;
  if (arena?.camera && arena !== fittedArena) {
    if (arena.ctx && arena.renderBackground) {
      // Fill the outer scenery at every aspect ratio. The central photograph
      // retains its calibrated world size, exactly matching cards and taps.
      arena.renderBackground = function () {
        const layer = document.createElement('canvas');
        layer.width = this.canvas.width; layer.height = this.canvas.height;
        const g = layer.getContext('2d');
        g.scale(this.scale, this.scale);
        g.fillStyle = '#182a2b'; g.fillRect(0, 0, this.width, this.height);
        const worldWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
        const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
        if (this.panoramaImage.complete && this.panoramaImage.naturalWidth) {
          let w = this.width * 38.4 / worldWidth, h = this.height * 16 / worldHeight;
          const cover = Math.max(1, this.width / w, this.height / h);
          w *= cover; h *= cover;
          g.drawImage(this.panoramaImage, (this.width - w) / 2, (this.height - h) / 2, w, h);
        }
        if (this.arenaImage.complete && this.arenaImage.naturalWidth) {
          const w = this.width * 24.32 / worldWidth, h = this.height * 15.2 / worldHeight;
          const center = document.createElement('canvas');
          center.width = this.arenaImage.naturalWidth; center.height = this.arenaImage.naturalHeight;
          const cg = center.getContext('2d'); cg.drawImage(this.arenaImage, 0, 0);
          cg.globalCompositeOperation = 'destination-in';
          const fade = cg.createLinearGradient(0, 0, center.width, 0);
          fade.addColorStop(0, '#0000'); fade.addColorStop(.045, '#000');
          fade.addColorStop(.955, '#000'); fade.addColorStop(1, '#0000');
          cg.fillStyle = fade; cg.fillRect(0, 0, center.width, center.height);
          g.drawImage(center, (this.width - w) / 2, (this.height - h) / 2, w, h);
        }
        this.background = layer;
      };
    } else if (arena.captureStaticBackground) {
      const originalCapture = arena.captureStaticBackground;
      let scenery;
      arena.captureStaticBackground = function (...args) {
        const mesh = this.fixed.children.find(node => node.material.map?.image?.src?.includes('arena-panorama-'));
        if (mesh) {
          const geometry = mesh.geometry, positions = geometry.attributes.position;
          if (scenery?.geometry !== geometry) {
            geometry.computeBoundingBox();
            scenery = { geometry, base: [...positions.array], center: geometry.boundingBox.getCenter(mesh.position.clone()).toArray() };
          }
          const cover = Math.max(1, (this.camera.right - this.camera.left) / this.camera.zoom / 38.4, (this.camera.top - this.camera.bottom) / this.camera.zoom / 16);
          for (let i = 0; i < positions.array.length; i++) {
            positions.array[i] = scenery.center[i % 3] + (scenery.base[i] - scenery.center[i % 3]) * cover;
          }
          positions.needsUpdate = true;
          geometry.computeBoundingSphere(); mesh.frustumCulled = false;
        }
        return originalCapture.apply(this, args);
      };
    }
    const originalResize = arena.resize;
    arena.resize = function (...args) {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      // Zoom the real orthographic camera, shared by the artwork, labels and
      // raycaster. Smaller phones retain room for both hands and side panels.
      const landscape = rect.width > rect.height && rect.height <= 650;
      const desired = Math.min(1.24, Math.max(1.06, 1.06 + (rect.height - 320) * .0016));
      const sideRoom = (rect.width - 176) / (rect.height * 14.9 / 15.2);
      this.camera.zoom = landscape ? Math.max(1, Math.min(desired, sideRoom)) : 1;
      const result = originalResize.apply(this, args);
      // The artwork bleeds behind the home indicator, while the hand stays
      // above it. Keep the lowest real tactic footprint clear of that hand.
      const hand = document.getElementById('ownHand')?.getBoundingClientRect();
      const lowerSlot = this.slots?.find(slot => slot.userData.id === 'ownTactic');
      if (landscape && hand?.height && lowerSlot) {
        this.camera.updateMatrixWorld();
        const edge = lowerSlot.position.clone();
        edge.z += lowerSlot.geometry.parameters.height / 2;
        const projected = edge.project(this.camera);
        const lowerY = (1 - projected.y) * rect.height / 2;
        const available = hand.top - rect.top - 8 - rect.height / 2;
        if (available > 0 && lowerY > hand.top - rect.top - 8) {
          this.camera.zoom *= available / (lowerY - rect.height / 2);
          originalResize.apply(this, args);
        }
      }
      return result;
    };
    fittedArena = arena;
    arena.resize();
  }
  if (bar && dock) body.classList.add('appCompactUI');
  return !!(bar && dock && fittedArena);
}

document.addEventListener('click', event => {
  for (const menu of menus) {
    if (!menu.container.contains(event.target)) menu.setOpen(false);
  }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const open = menus.find(menu => !menu.panel.hidden);
  if (open) { open.setOpen(false); open.toggle.focus(); }
});
// boot.js imports the renderer asynchronously. Watch until its dock and camera
// exist, then stop observing the DOM; gameplay does not rebuild these menus.
if (!prepareAppLayout() && stage) {
  const startupObserver = new MutationObserver(() => {
    if (prepareAppLayout()) startupObserver.disconnect();
  });
  startupObserver.observe(stage, { childList: true });
}
const gate = document.createElement('section');
gate.id = 'appOrientation';
gate.setAttribute('role', 'status');
gate.setAttribute('aria-live', 'polite');
gate.innerHTML = '<strong>DUEL ARENA</strong><p>スマホを横向きにして遊んでね！</p><span>カードをタップして選択 → 山札のボタンで決定</span>';
body.append(gate);

export function viewportSize(viewport = window.visualViewport) {
  const measured = viewportProbe.getBoundingClientRect();
  if (measured.width > 0 && measured.height > 0) {
    return { width: Math.round(measured.width), height: Math.round(measured.height) };
  }
  const layout = { width: window.innerWidth, height: window.innerHeight };
  // Fallback for browsers without viewport-unit layout: reject transient
  // portrait dimensions and pinch-zoom measurements during landscape entry.
  const consistent = viewport?.width > 0 && viewport?.height > 0
    && Math.abs((viewport.scale || 1) - 1) < .01
    && Math.abs(viewport.width - layout.width) < 2
    && (viewport.width >= viewport.height) === (layout.width >= layout.height);
  const current = consistent ? viewport : layout;
  return { width: Math.round(current.width || lastViewport?.width || 1), height: Math.round(current.height || lastViewport?.height || 1) };
}
export function fitAppViewport() {
  if (document.hidden && lastViewport) return;
  const { width, height } = viewportSize();
  const probeStyle = getComputedStyle(viewportProbe);
  const safeArea = [probeStyle.paddingTop, probeStyle.paddingRight, probeStyle.paddingBottom, probeStyle.paddingLeft].join(' ');
  const changed = !lastViewport || width !== lastViewport.width || height !== lastViewport.height || safeArea !== lastSafeArea;
  lastSafeArea = safeArea;
  lastViewport = { width, height };
  if (changed) {
    body.style.setProperty('--app-height', `${height}px`);
    body.style.setProperty('--app-width', `${width}px`);
  }
  body.classList.toggle('appPortrait', height > width);
  gate.hidden = width >= height;
  prepareAppLayout();
  if (changed && !resizeQueued) {
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      window.DuelArena?.resize?.();
    });
  }
}
function synchronizeViewport() {
  settlingTimers.forEach(clearTimeout);
  settlingTimers = [];
  fitAppViewport();
  if (document.hidden) return;
  // iOS can dispatch orientationchange before the new viewport has settled.
  // These bounded rechecks also cover restored pages without a resize event.
  settlingTimers = [100, 300, 700, 1500].map(delay => setTimeout(fitAppViewport, delay));
}
synchronizeViewport();
for (const event of ['resize', 'orientationchange', 'pageshow', 'load', 'focus']) {
  window.addEventListener(event, synchronizeViewport, { passive: true });
}
window.visualViewport?.addEventListener('resize', synchronizeViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', synchronizeViewport, { passive: true });
window.screen.orientation?.addEventListener('change', synchronizeViewport, { passive: true });
document.addEventListener('visibilitychange', synchronizeViewport);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(synchronizeViewport).observe(viewportProbe);

// DOM labels are regenerated by the original renderer. Re-layout decision
// orbs through that renderer rather than guessing their screen coordinates.
window.addEventListener('duel:render', () => body.classList.add('touchInput'));
body.classList.add('touchInput');
document.addEventListener('contextmenu', event => {
  if (event.target.closest?.('#battleStage')) event.preventDefault();
});

// Avoid leaving a held hand-card hover after an interrupted finger gesture.
document.addEventListener('pointercancel', () => window.dispatchEvent(new Event('blur')), { passive: true });

// WEB app updates apply before the next game, never during a match.
if ( 'serviceWorker' in navigator && window.isSecureContext) {
  let reloading = false;
  let controlled = !!navigator.serviceWorker.controller;
  let gameStarted = false;
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-start-mode], #comStartBtn, #autoStartBtn')) gameStarted = true;
  }, true);
  const updateIsSafe = () => !gameStarted && !window.DuelEngine?.view();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first installation claims the page already serving these assets.
    // Reloading it races with rotation, menus and the first game-start tap.
    if (!controlled) { controlled = true; return; }
    if (reloading) return;
    reloading = true;
    if (updateIsSafe()) location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(registration => {
    const activateAtWelcome = () => {
      if (updateIsSafe()) registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
    };
    activateAtWelcome();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', activateAtWelcome);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { registration.update().catch(console.warn); activateAtWelcome(); }
    });
  }).catch(error => console.warn('Offline cache unavailable', error));
}
