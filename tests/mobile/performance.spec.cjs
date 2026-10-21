const {test,expect}=require('@playwright/test');

test('@performance prepared card faces preserve the original artwork and dimensions',async({page})=>{
 await page.goto('/game.html');await page.waitForFunction(()=>!!window.DuelArena);
 const report=await page.evaluate(async()=>{
  const manifest=await (await fetch('./app/prepared/manifest.json')).json();
  if(!Object.keys(manifest).length)throw Error('Public builds must include prepared original artwork');
  const {cardTexture,waitForCardBack}=await import('./src/materials.js?v=97');
  await waitForCardBack();await document.fonts.load('bold 30px DuelSans');
  // A dedicated context uses the same already-cached original image files.
  const assets=await Promise.all(Object.values(window.DuelEngine.cardCatalog()).flatMap(group=>group.cards).map(card=>card));
  let maxMean=0,maxMismatch=0,maxArtMean=0,count=0;const details=[];
  for(const card of [...assets,{type:'back',title:'',effect:''}]){
   const level=card.effect.match(/(?:現在の攻撃力：|Lv\.?\s*)(-?\d+)/)?.[1]||'1';
   const key=card.type==='back'?'back':card.type+'|'+card.title+'|'+(card.type==='character'?level:card.effect),file=manifest[key];
   if(!file)throw Error('Missing prepared face '+key);
   const image=new Image();image.src='./app/prepared/'+file;await image.decode();
   const original=cardTexture(card.type,card.title,card.effect).image;
   const actual=document.createElement('canvas');actual.width=image.naturalWidth;actual.height=image.naturalHeight;
   actual.getContext('2d').drawImage(image,0,0);
   if(actual.width!==original.width||actual.height!==original.height)throw Error('Changed card dimensions');
   const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data;
   const b=original.getContext('2d').getImageData(0,0,original.width,original.height).data;
   let difference=0,mismatch=0,artDifference=0,artSamples=0;
   for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<4;c++)delta+=Math.abs(a[i+c]-b[i+c]);difference+=delta;if(delta>20)mismatch++;const y=Math.floor(i/4/actual.width)/actual.height;if(y>.17&&y<.80){artDifference+=delta;artSamples+=4;}}
   details.push({title:card.title,mean:difference/a.length,artMean:artDifference/artSamples});
   maxArtMean=Math.max(maxArtMean,artDifference/artSamples);maxMean=Math.max(maxMean,difference/a.length);maxMismatch=Math.max(maxMismatch,mismatch/(a.length/4));count++;
  }
  return {count,maxMean,maxMismatch,maxArtMean,details};
 });
 console.log('Original/prepared artwork comparison',JSON.stringify(report));
 expect(report.count).toBeGreaterThan(40);
 // Same Chromium rasterizer as the build. WebKit has independent image resampling/text antialiasing.
 // The generator separately asserts exact RGBA equality before/after lossless conversion.
 expect(report.maxMean).toBeLessThan(test.info().project.name==='chromium'?.1:3.5);
 expect(report.maxMismatch).toBeLessThan(test.info().project.name==='chromium'?.025:.12);
});

test('@performance catalog and normal play use prepared faces without synchronous image encoding',async({page})=>{
 await page.addInitScript(()=>{
  let calls=0;Math.random=()=>.1+(++calls%65536)/65536000;
  window.syncImageEncodes=0;
  const original=HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL=function(...args){window.syncImageEncodes++;return original.apply(this,args);};
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:844,height:390});
 await page.goto('/game.html');await page.waitForFunction(()=>!!window.DuelArena);
 await page.locator('#appTopMenuToggle').click();await page.locator('#cardCatalogBtn').click();
 await expect(page.locator('.catalogCard img').first()).toBeVisible();
 await page.locator('#cardCatalogClose').click();
 await page.locator('#welcome [data-start-mode="com"]').click();
 try{await expect(page.locator('#ownHand .card').first()).toBeVisible({timeout:60000});}catch(error){console.log('Startup state',await page.evaluate(()=>({state:window.DuelEngine.view(),notice:document.querySelector('#arenaNotice').textContent,overlay:document.querySelector('#gameStartOverlay').innerText,hand:document.querySelector('#ownHand').innerHTML})));throw error;}
 await page.locator('#ownHand .card.type-character').first().click();
 await expect(page.locator('#boardCardPreview')).toBeVisible();
 await page.locator('.boardLegalSlot').first().click();
 await expect(page.locator('#ownBattle .slot.char')).toHaveCount(1);
 expect(await page.evaluate(()=>window.syncImageEncodes)).toBe(0);
 expect(errors).toEqual([]);
 await page.screenshot({path:`test-results/${test.info().project.name}-optimized-summon.png`});
});
