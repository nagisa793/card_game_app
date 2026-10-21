const {test,expect}=require('@playwright/test');

for(const renderer of ['WebGL','software']) {
  test(`touch release does not leave a large field-card preview after another placement (${renderer})`,async({page})=>{
    await page.setViewportSize({width:844,height:390});
    await page.addInitScript(({software})=>{
      let calls=0;Math.random=()=>.1+(++calls%65536)/65536000;
      if(software){
        const getContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:getContext.call(this,type,...args);};
      }
      // A touch can end without a canvas pointerleave during DOM replacement,
      // cancellation or Safari page restoration. Do not rely on that event.
      document.addEventListener('pointerleave',event=>{
        if(event.target instanceof HTMLCanvasElement)event.stopImmediatePropagation();
      },true);
    },{software:renderer==='software'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/game.html');await page.waitForFunction(()=>!!window.DuelArena);
    await page.locator('#welcome [data-start-mode="com"]').tap();
    await expect(page.locator('#ownHand .card.type-character').first()).toBeVisible({timeout:60000});
    await page.locator('#ownHand .card.type-character').first().tap();
    await page.locator('.boardLegalSlot').first().tap();
    await expect(page.locator('#ownBattle .slot.char')).toHaveCount(1);
    const point=await page.evaluate(()=>{
      const arena=window.DuelArena,slot=arena.slots.find(slot=>slot.userData.id==='ownBattle'&&slot.userData.index===0);
      const p=slot.position.clone();p.y=.5;p.project(arena.camera);
      const r=arena.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
    });
    await page.touchscreen.tap(point.x,point.y);
    // A deliberate field-card tap still opens the normal detail panel.
    await expect(page.locator('#boardCardPreview')).toBeVisible();
    await page.locator('#ownHand .card.type-character').first().tap();
    await page.locator('.boardLegalSlot').first().tap();
    await expect(page.locator('#ownBattle .slot.char')).toHaveCount(2);
    await expect(page.locator('#boardCardPreview')).toBeHidden();
    // Force the real renderer to rebind after a later update, as happens after
    // a card image finishes loading. A released finger cannot become hover again.
    await page.evaluate(()=>window.DuelArena.sync());
    await expect(page.locator('#boardCardPreview')).toBeHidden();
    expect(await page.evaluate(()=>window.DuelArena.pointerInside)).toBe(false);
    expect(await page.evaluate(()=>window.DuelArena.hoverSlot)).toBeNull();
    expect(errors).toEqual([]);
    await page.screenshot({path:`test-results/${test.info().project.name}-stable-field-cards-${renderer}.png`});
  });
}
