const{test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const{sourceHashes}=require("./source-hashes.cjs");
test("verification fingerprint detects changed assets and added or removed source files",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"star-fingerprint-"));
 for(const project of ["Antigravity-Cat-Widget","Antigravity-Dream-Skin"]){
  for(const dir of ["src","assets"])fs.mkdirSync(path.join(root,project,dir),{recursive:true});
 }
 fs.writeFileSync(path.join(root,"Antigravity-Cat-Widget/package.json"),"{}");
 for(const dir of ["shared","tools"])fs.mkdirSync(path.join(root,dir));
 for(const name of ["package.json","package-lock.json","启动星语挂件.cmd"])fs.writeFileSync(path.join(root,name),"fixture");
 const asset=path.join(root,"Antigravity-Cat-Widget/assets/idle.png"),added=path.join(root,"Antigravity-Dream-Skin/src/added.cjs");
 fs.writeFileSync(asset,"original");const initial=sourceHashes(root);
 fs.writeFileSync(asset,"changed");assert.notDeepEqual(sourceHashes(root),initial);
 fs.writeFileSync(asset,"original");assert.deepEqual(sourceHashes(root),initial);
 fs.writeFileSync(added,"new source");assert.notDeepEqual(sourceHashes(root),initial);
 fs.unlinkSync(added);assert.deepEqual(sourceHashes(root),initial);
});
