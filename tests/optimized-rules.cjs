// Run the complete maintained upstream rule/UI suite against the rendering adapter.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.join(__dirname,'rules-regression.cjs');
const source=fs.readFileSync(filename,'utf8');
const before="let src=fs.readFileSync(root+'/src/engine.js','utf8')";
if(!source.includes(before))throw Error('Review optimized rule test entry after upstream changes');
const adapted=source.replace(before,"w.DuelAppSetHTML=(node,html)=>{if(node.__htmlVersion!==html){node.innerHTML=html;node.__htmlVersion=html;}};\nlet src=fs.readFileSync(root+'/app/runtime/engine.js','utf8')");
const runner=new Module(filename,module);runner.filename=filename;runner.paths=module.paths;
runner._compile(adapted,filename);
