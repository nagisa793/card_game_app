// The original engine, renderer, phase timers and pointer handlers stay intact.
// Only the WEB app viewport and browser lifecycle are handled here.
const body = document.body;
const stage = document.getElementById('battleStage');
const menus = [];
let fittedArena;

function compactMenu(container, panel, id, label) {
  panel.id = id;
  panel.classList.add('appMenuPanel');
  panel.hidden = true;
  const toggle = document.createElement('button');
  toggle.id = id + 'Toggle';
  toggle.type = 'button';
  toggle.className = 'appMenuToggle';
  toggle.setAttribute('aria-controls', id);
  const setOpen = open => {
    panel.hidden = !open;
    toggle.textContent = open ? '▶️' : '◀️';
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
  });
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
    // The software fallback sizes its photograph from the frustum numbers.
    // Give that drawing pass the effective zoomed frustum without changing
    // the camera's projection matrix used by cards and touch targets.
    if (arena.ctx && arena.renderBackground) {
      const originalBackground = arena.renderBackground;
      arena.renderBackground = function (...args) {
        const camera = this.camera;
        const edges = [camera.left, camera.right, camera.top, camera.bottom];
        [camera.left, camera.right, camera.top, camera.bottom] = edges.map(edge => edge / camera.zoom);
        try { return originalBackground.apply(this, args); }
        finally { [camera.left, camera.right, camera.top, camera.bottom] = edges; }
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
      return originalResize.apply(this, args);
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
  return { width: Math.round(viewport?.width || window.innerWidth), height: Math.round(viewport?.height || window.innerHeight) };
}
export function fitAppViewport() {
  const { width, height } = viewportSize();
  body.style.setProperty('--app-height', `${height}px`);
  body.style.setProperty('--app-width', `${width}px`);
  body.classList.toggle('appPortrait', height > width);
  gate.hidden = width >= height;
  prepareAppLayout();
  // Let ResizeObserver recalculate real pixel coordinates. No CSS transforms
  // or synthetic clicks are applied to the field or touch coordinates.
  requestAnimationFrame(() => window.DuelArena?.resize?.());
}
fitAppViewport();
window.addEventListener('resize', fitAppViewport, { passive: true });
window.visualViewport?.addEventListener('resize', fitAppViewport, { passive: true });
window.addEventListener('orientationchange', fitAppViewport, { passive: true });

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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    if (!window.DuelEngine?.view()) location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(registration => {
    const activateAtWelcome = () => {
      if (!window.DuelEngine?.view()) registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
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
