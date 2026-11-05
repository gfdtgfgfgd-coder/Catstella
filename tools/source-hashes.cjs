const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
function sourceHashes(root){
 const result={};
 function walk(relative){
  const absolute=path.join(root,relative);
  if(fs.statSync(absolute).isDirectory()){
   for(const name of fs.readdirSync(absolute).sort())walk(relative+"/"+name);
  }else result[relative]=crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
 }
 for(const project of ["Antigravity-Cat-Widget","Antigravity-Dream-Skin"]){
  for(const item of ["src","assets"])walk(project+"/"+item);
 }
 for(const item of ["Antigravity-Cat-Widget/package.json","shared","tools","package.json","package-lock.json","启动星语挂件.cmd"])walk(item);
 return result;
}
module.exports={sourceHashes};
