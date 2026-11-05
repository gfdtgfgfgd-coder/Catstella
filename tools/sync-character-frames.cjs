// 把 web 端（角色素材权威源）的角色帧同步到桌面端 character-packs。
// 用法：node tools/sync-character-frames.cjs [--check]   （--check 只报告差异，不写入）
// 与安装器共用唯一源探测：WEB_COMPANION_PATH 或 ../Catstella-web/Gemini-Web-Companion。
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const checkOnly=process.argv.includes("--check");
const {detectWebCompanion}=require('./web-companion-path.cjs');
const web=detectWebCompanion();
const webChars=web&&path.join(web.base,'assets','characters');
if(!webChars||!fs.existsSync(webChars)){console.error("✘ 未找到活动 Web 工作区的角色素材；可用 WEB_COMPANION_PATH 指定扩展源码目录。");process.exit(1);}
const dstRoot=path.join(root,"Antigravity-Cat-Widget/assets/character-packs");
const md5=file=>crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
let copied=0,same=0,missing=0;
for(const pack of fs.readdirSync(webChars,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name)){
 const srcDir=path.join(webChars,pack),dstDir=path.join(dstRoot,pack,"frames");
 for(const file of fs.readdirSync(srcDir).filter(f=>f.endsWith(".png")).sort()){
  const src=path.join(srcDir,file),dst=path.join(dstDir,file);
  if(!fs.existsSync(dst)){console.log(`+ ${pack}/${file}（桌面端缺失）`);missing++;if(!checkOnly){fs.mkdirSync(dstDir,{recursive:true});fs.copyFileSync(src,dst);}continue;}
  if(md5(src)!==md5(dst)){console.log(`~ ${pack}/${file}（内容不同，web 版为准）`);copied++;if(!checkOnly)fs.copyFileSync(src,dst);continue;}
  same++;
 }
}
const verb=checkOnly?"将同步":"已同步";
console.log(`\n${verb}: 更新 ${copied} · 补缺 ${missing} · 一致 ${same}（源：${webChars}）`);
if(checkOnly&&(copied||missing))process.exitCode=2;
