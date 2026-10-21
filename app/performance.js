// Rendering-only helpers. The upstream engine retains every rule and action.
const htmlVersions = new WeakMap();
export const counters = { htmlWrites: 0, htmlSkipped: 0, encodedFaces: 0, releasedFaces: 0 };

export function setHTML(element, html) {
  if (htmlVersions.get(element) === html) { counters.htmlSkipped++; return; }
  element.innerHTML = html;
  htmlVersions.set(element, html);
  counters.htmlWrites++;
}

export function visualKey(type, title, effect = '') {
  if (type === 'back') return 'back';
  if (type === 'character') {
    const match = String(effect).match(/(?:現在の攻撃力：|Lv\.?\s*)(-?\d+)/);
    return type + '|' + title + '|' + (match ? match[1] : '1');
  }
  return type + '|' + title + '|' + effect;
}

// Keep the actual image and URL in one entry. Never evict a live field texture.
export function trimTextures(cache, limit = 48) {
  if (cache.size <= limit) return;
  const live = new Set();
  window.DuelArena?.scene?.traverse(node => {
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material?.map) live.add(material.map);
    }
  });
  for (const [key, texture] of cache) {
    if (cache.size <= limit) break;
    if (live.has(texture) || texture.userData?.encoding) continue;
    cache.delete(key);
    texture.dispose();
    if (texture.userData?.blobURL) URL.revokeObjectURL(texture.userData.blobURL);
    counters.releasedFaces++;
  }
}

window.DuelAppPerformance = { counters };
