import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function engine(optimized) {
 const dom=new JSDOM(await readFile('www/game.html','utf8'),{runScripts:'outside-only',url:'https://test.invalid',pretendToBeVisual:true});
 const w=dom.window;w.requestAnimationFrame=()=>0;w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};
 w.eval((await readFile('app/performance.js','utf8')).replaceAll('export ',''));
 w.eval('window.DuelAppSetHTML=setHTML;');
 let writes=0;
 const descriptor=Object.getOwnPropertyDescriptor(w.Element.prototype,'innerHTML');
 Object.defineProperty(w.Element.prototype,'innerHTML',{...descriptor,set(value){writes++;descriptor.set.call(this,value);}});
 const source=await readFile(optimized?'www/app/runtime/engine.js':'www/src/engine.js','utf8');
 w.eval(source.replace('window.DuelEngine=Object.freeze({','window.__render=render;window.__start=startGame;window.DuelEngine=Object.freeze({'));
 w.__start('com','A');
 return {dom,w,writes:()=>writes};
}

test('unchanged game states retain card DOM and avoid repeated HTML parsing',async()=>{
 const original=await engine(false),optimized=await engine(true);
 try{
  const beforeOriginal=original.writes(),beforeOptimized=optimized.writes();
  const hand=optimized.w.document.querySelector('#ownHand .card');
  for(let i=0;i<20;i++){original.w.__render();optimized.w.__render();}
  const previous=original.writes()-beforeOriginal,next=optimized.writes()-beforeOptimized;
  assert(previous>=300,`Expected the original full updates, got ${previous}`);
  assert.equal(next,0,'Repeated identical state must not replace any HTML');
  assert.equal(optimized.w.document.querySelector('#ownHand .card'),hand,'Retain the actual card, image and touch target');
  console.log(`Repeated-state HTML writes: ${previous} → ${next}`);
 }finally{original.dom.window.close();optimized.dom.window.close();}
});

test('texture eviction retains live field maps and releases only unused variants',async()=>{
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval((await readFile('app/performance.js','utf8')).replaceAll('export ',''));
  w.eval(`
   const cache=new Map();let disposed=0;const live={dispose(){throw Error('Released visible card');}};
   window.DuelArena={scene:{traverse(callback){callback({material:{map:live}});}}};
   cache.set('visible',live);for(let i=0;i<60;i++)cache.set(i,{dispose(){disposed++;}});
   trimTextures(cache,12);window.result={size:cache.size,visible:cache.has('visible'),disposed};
  `);
  assert.deepEqual({...w.result},{size:12,visible:true,disposed:49});
 }finally{w.close();}
});

test('changing metadata without changing printed artwork reuses the same visual key',async()=>{
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval((await readFile('app/performance.js','utf8')).replaceAll('export ',''));
  assert.equal(w.eval("visualKey('character','ジェイ','Lv. 3 その他の情報')"),w.eval("visualKey('character','ジェイ','現在の攻撃力：3')"));
  assert.notEqual(w.eval("visualKey('character','ジェイ','Lv. 3')"),w.eval("visualKey('character','ジェイ','Lv. 4')"));
 }finally{w.close();}
});
