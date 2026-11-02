#!/usr/bin/env node
// 优雅平滑重启：先通过单实例 IPC 发送 --quit，等待单例锁释放后再基于当前 Git 源码重新拉起。
// 全程绝不使用 taskkill /f 强杀，避免打断 writeJson 原子写入导致 settings.json 损坏。
const path=require("node:path"),{spawn}=require("node:child_process");
const {root,resolveElectron,dataDir,spawnApp}=require("./launch.cjs");
const KIND_NAME={widget:"喵言喵语桌宠",skin:"Gemini · Dream Skin"};
const KIND_LABEL={widget:"星语挂件",skin:"星语皮肤"};
const kind=process.argv[2]==="skin"?"skin":process.argv[2]==="widget"?"widget":null;
if(!kind){console.error("用法：node tools/restart.cjs widget|skin");process.exit(1);}
const electron=resolveElectron();
const entry=path.join(root,kind==="skin"?"Antigravity-Dream-Skin":"Antigravity-Cat-Widget","src/main/index.cjs");
const userData=path.join(dataDir(kind),"runtime"),name=KIND_NAME[kind];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function envClean(){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;return env;}
function runElectron(args,timeoutMs){
 return new Promise((resolve,reject)=>{
  const child=spawn(electron,args,{cwd:root,env:envClean(),stdio:"ignore",windowsHide:true});
  const timer=setTimeout(()=>{child.kill();reject(new Error("等待进程退出超时"));},timeoutMs);
  child.on("exit",()=>{clearTimeout(timer);resolve();});
  child.on("error",error=>{clearTimeout(timer);reject(error);});
 });
}
function probeLock(){
 return new Promise((resolve,reject)=>{
  // --background：旧实例收到 second-instance 时保持安静，不弹窗唤回
  const child=spawn(electron,[path.join(__dirname,"lock-probe.cjs"),userData,name,"--background"],{cwd:root,env:envClean(),stdio:["ignore","pipe","ignore"],windowsHide:true});
  let output="";
  const timer=setTimeout(()=>{child.kill();reject(new Error("锁探测超时"));},10000);
  child.stdout.on("data",chunk=>output+=chunk);
  child.on("exit",code=>{clearTimeout(timer);resolve(code===0&&output.includes("LOCK_FREE"));});
  child.on("error",error=>{clearTimeout(timer);reject(error);});
 });
}
(async()=>{
 try{
  let free=await probeLock();
  if(!free){
   console.log(`[1/3] 通知 ${KIND_LABEL[kind]} 旧实例优雅退出（--quit 单实例 IPC）…`);
   await runElectron([entry,"--quit"],15000);
   console.log("[2/3] 等待单例锁释放（最多 30 秒）…");
   const deadline=Date.now()+30000;
   while(Date.now()<deadline){
    if(await probeLock()){free=true;break;}
    await sleep(400);
   }
  }
  if(!free)throw new Error("单例锁迟迟未释放，请手动检查旧实例进程后再试");
  console.log("[3/3] 基于当前源码重新拉起…");
  spawnApp(kind);
  console.log(`✔ ${KIND_LABEL[kind]} 已基于当前源码平滑重启。`);
 }catch(error){
  console.error("✘ 重启失败："+error.message);
  process.exit(1);
 }
})();
