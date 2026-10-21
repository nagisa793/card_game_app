// Build-time rasterization runs on GitHub Actions, never on a player's phone.
// It uses the unchanged upstream painter, original font and lossless WebP.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.env.SITES_MANAGED_LINUX_CONTAINER === '1') throw new Error('Run card preparation in the CI build environment.');
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'app/prepared');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/prepare.html'){
   let html=await readFile(path.join(root,'web/index.html'),'utf8');
   html=html.replace(/<script type="module" src="\.\/src\/boot\.js[^\"]*"><\/script>/,'');
   res.setHeader('Content-Type','text/html');res.end(html);return;
  }
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),file=path.resolve(root,'web',relative);
  if(!file.startsWith(path.join(root,'web')+path.sep))throw Error('Invalid asset');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
  let data=await readFile(file);
  if(relative==='src/materials.js')data=Buffer.from('const allLoads=[];\n'+data.toString().replace(
   'function loadImage(url,onload,onerror){const img=new Image();img.onload=()=>{onload(img);queueTextureRefresh();};img.onerror=()=>{onerror?.();queueTextureRefresh();};img.src=url;}',
   "function loadImage(url,onload,onerror){const img=new Image();allLoads.push(new Promise((resolve,reject)=>{img.onload=()=>{onload(img);queueTextureRefresh();resolve();};img.onerror=()=>reject(Error('Missing original artwork: '+url));}));img.src=url;}")+ '\nexport const allArtReady=Promise.all(allLoads);');
  res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/prepare.html`);
 const cards=await page.evaluate(async()=>{
  await document.fonts.load('bold 30px DuelSans');
  const material=await import('./src/materials.js?v=97');
  await material.allArtReady;
  await material.waitForCardBack();
  const list=window.DuelEngine.cardCatalog().flatMap(group=>group.cards);
  for(const card of [...list])if(card.effect.includes('（2枚中1枚は連続発動）'))list.push({...card,effect:card.effect.replace('（2枚中1枚は連続発動）','')});
  list.push({type:'back',title:'',effect:''});return list;
 });
 const manifest={};
 for(const card of cards){
  const level=card.effect.match(/(?:現在の攻撃力：|Lv\.?\s*)(-?\d+)/)?.[1]||'1';
  const key=card.type==='back'?'back':card.type+'|'+card.title+'|'+(card.type==='character'?level:card.effect);
  if(manifest[key])continue;
  const data=await page.evaluate(async card=>{const {cardTexture}=await import('./src/materials.js?v=97');return cardTexture(card.type,card.title,card.effect).image.toDataURL('image/png').split(',')[1];},card);
  const file=createHash('sha256').update(key).digest('hex').slice(0,20)+'.webp';
  const converted=spawnSync('python3',['-c',"from PIL import Image;import io,sys;original=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA');original.save(sys.argv[1],format='WEBP',lossless=True,method=6,exact=True);actual=Image.open(sys.argv[1]).convert('RGBA');assert original.tobytes()==actual.tobytes(),'Card conversion changed original pixels'",path.join(output,file)],{input:Buffer.from(data,'base64')});
  if(converted.status!==0)throw Error(converted.stderr.toString());manifest[key]=file;
 }
 await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(`Prepared ${Object.keys(manifest).length} original card faces without changing dimensions or pixels.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
