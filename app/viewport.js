// Keep the game's own viewport landscape, independently of OS rotation lock.
const frame = document.getElementById('gameViewport');
const probe = document.getElementById('appDisplayProbe');
let lastViewport;
let settlingTimers = [];

export function landscapeViewport(width, height, safeArea) {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const rotated = height >= width;
  return {
    width: rotated ? height : width,
    height: rotated ? width : height,
    rotated,
    // With a clockwise frame rotation its logical top is the display's right.
    safeArea: rotated ? {
      top: safeArea.right, right: safeArea.bottom,
      bottom: safeArea.left, left: safeArea.top,
    } : { ...safeArea },
  };
}

export function fitGameViewport() {
  if (document.hidden && lastViewport) return lastViewport;
  const measured = probe.getBoundingClientRect();
  const width = Math.max(1, Math.round(measured.width || window.innerWidth));
  const height = Math.max(1, Math.round(measured.height || window.innerHeight));
  const style = getComputedStyle(probe);
  const viewport = landscapeViewport(width, height, {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  });
  // The child reads this before laying out hands and menus. Insets belong to
  // the host display, so rotate them along with the complete game viewport.
  window.DuelAppViewport = viewport;
  frame.style.width = `${viewport.width}px`;
  frame.style.height = `${viewport.height}px`;
  frame.style.transform = viewport.rotated
    ? `translateX(${width}px) rotate(90deg)` : 'none';
  lastViewport = viewport;
  frame.contentWindow?.postMessage({ type: 'duel:viewport' }, window.location.origin);
  return viewport;
}

function synchronizeViewport() {
  settlingTimers.forEach(clearTimeout);
  settlingTimers = [];
  fitGameViewport();
  if (document.hidden) return;
  // Safari may publish orientation events before its final viewport metrics.
  settlingTimers = [100, 300, 700, 1500].map(delay => setTimeout(fitGameViewport, delay));
}

synchronizeViewport();
frame.addEventListener('load', synchronizeViewport);
for (const event of ['resize', 'orientationchange', 'pageshow', 'load', 'focus']) {
  window.addEventListener(event, synchronizeViewport, { passive: true });
}
window.visualViewport?.addEventListener('resize', synchronizeViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', synchronizeViewport, { passive: true });
window.screen.orientation?.addEventListener('change', synchronizeViewport, { passive: true });
document.addEventListener('visibilitychange', synchronizeViewport);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(synchronizeViewport).observe(probe);
