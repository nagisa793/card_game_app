import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function replaceOnce(source, before, after, label) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`Review the smartphone rendering adapter: ${label} changed upstream`);
  }
  return source.replace(before, after);
}

export async function optimizeWeb(root, output) {
  const directory = path.join(output, 'app/runtime');
  await mkdir(directory, { recursive: true });
  for (const filename of await readdir(path.join(root, 'web/src'))) {
    let source = await readFile(path.join(root, 'web/src', filename), 'utf8');
    source = source.replaceAll('../assets/', '../../assets/').replaceAll('../vendor/', '../../vendor/');
    if (filename === 'engine.js') {
      // Only DOM writes are adapted. The engine's functions, timers and rules stay intact.
      const assignment = /((?:document\.getElementById\('[^']+'\)|[A-Za-z_$][\w$]*)\.innerHTML)\s*=\s*([^;\n]+);/g;
      source = source.replace(assignment, (statement, target, expression) => target.startsWith('logEl.') ? statement : `window.DuelAppSetHTML(${target.slice(0, -10)}, ${expression});`);
    }
    if (filename === 'materials.js') {
      source = "import { visualKey, trimTextures } from '../performance.js';\n" + source;
      source = source.replace('const key=type+\'|\'+title+\'|\'+effect;if(textureCache.has(key))return textureCache.get(key);',
        "const key=visualKey(type,title,effect);if(textureCache.has(key)){const cached=textureCache.get(key);textureCache.delete(key);textureCache.set(key,cached);return cached;}\n const ready=preparedFaces[key];if(ready){const texture=new T.Texture(document.createElement('canvas'));texture.userData.preparedURL=new URL('../prepared/'+ready,import.meta.url).href;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;textureCache.set(key,texture);const image=new Image();image.onload=()=>{texture.image=image;texture.needsUpdate=true;window.DuelArena?.invalidate();};image.src=texture.userData.preparedURL;queueMicrotask(()=>trimTextures(textureCache));return texture;}");
      source = replaceOnce(source, 'function refreshTextures(){for(const texture of textureCache.values()){', 'function refreshTextures(){for(const texture of textureCache.values()){if(texture.userData.preparedURL)continue;', 'card refresh');
      source = source.replace('textureCache.set(key,texture);return texture;', 'textureCache.set(key,texture);queueMicrotask(()=>trimTextures(textureCache));return texture;');
      source += "\nlet preparedFaces={};try{const response=await fetch(new URL('../prepared/manifest.json',import.meta.url));if(response.ok)preparedFaces=await response.json();}catch{}\nexport function preparedFaceURL(type,title,effect=''){const file=preparedFaces[visualKey(type,title,effect)];return file?new URL('../prepared/'+file,import.meta.url).href:null;}\n";
    }
    if (filename === 'main.js') {
      source = "import { counters, trimTextures } from '../performance.js';\n" + source;
      source = source.replace("import {cardTexture,cardFaceReady}", "import {cardTexture,cardFaceReady,textureCache,preparedFaceURL}");
      source = replaceOnce(source,
        "const imageCache=new Map();\nfunction artwork(type,title,effect=''){const key=type+'|'+title+'|'+effect;if(!imageCache.has(key))imageCache.set(key,cardTexture(type,title,effect).image.toDataURL('image/webp',.95));return imageCache.get(key);}",
        "const imageCache={clear(){}};\nfunction artwork(type,title,effect=''){\n const ready=preparedFaceURL(type,title,effect);if(ready)return ready;\n const texture=cardTexture(type,title,effect),state=texture.userData;\n if(!state.blobURL&&!state.encoding){state.encoding=true;const canvas=texture.image,revision=state.revision||0;canvas.toBlob(blob=>{state.encoding=false;if(revision!==(state.revision||0)){window.dispatchEvent(new CustomEvent('duel:face-ready'));return;}if(!blob||![...textureCache.values()].includes(texture))return;state.blobURL=URL.createObjectURL(blob);counters.encodedFaces++;window.dispatchEvent(new CustomEvent('duel:face-ready'));},'image/png');}\n return state.blobURL||'';\n}\nwindow.addEventListener('duel:face-ready',()=>{inspectSignature='';previewSignature='';showCardPreview();updateHandCardArt();updateInspector();trimTextures(textureCache);});",
        'card image conversion');
      source = source.replace("if(img.getAttribute('src')!==url)", "if(url&&img.getAttribute('src')!==url)");
      // Art refreshes replace dynamic canvases. Revoke their old URLs before re-encoding.
      source = source.replace("imageCache.clear();inspectSignature='';", "for(const texture of textureCache.values()){texture.userData.revision=(texture.userData.revision||0)+1;if(texture.userData.blobURL){URL.revokeObjectURL(texture.userData.blobURL);delete texture.userData.blobURL;}}imageCache.clear();inspectSignature='';");
    }
    if (filename === 'interface.css') {
      source = source.replace("url('../../assets/NotoSansJP.ttf') format('truetype')", "url('../fonts/duel.woff2') format('woff2')");
      // Paint containment bounds invalidation without changing blur, opacity, shadows or geometry.
      source += '\n.handRow,.chainHistoryPanel,.selectionPanel,.sideColumn .controls,.historyArea{contain:layout style;}\n';
    }
    await writeFile(path.join(directory, filename), source);
  }
  await writeFile(path.join(output, 'app/render-bootstrap.js'),
    "import {setHTML} from './performance.js';window.DuelAppSetHTML=setHTML;await import('./runtime/engine.js');await import('./runtime/boot.js');\n");
}
