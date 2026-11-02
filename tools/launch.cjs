const path=require("node:path"),fs=require("node:fs"),{spawn}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const KIND_DIR={widget:"Antigravity-Cat-Widget",skin:"Antigravity-Dream-Skin"};
const kindDir=kind=>path.join(root,KIND_DIR[kind]||KIND_DIR.widget);
function resolveElectron(){
 let exe=path.join(root,"runtime/electron-45.1.0/electron.exe");
 if(!fs.existsSync(exe)){try{exe=require(require.resolve("electron",{paths:[root]}));}catch{}}
 if(!fs.existsSync(exe))throw new Error("请使用包含 runtime 的便携包，或按 README 准备 Electron 45.1.0。");
 return exe;
}
function dataDir(kind){return path.join(require("node:os").homedir(),(KIND_DIR[kind]||KIND_DIR.widget).includes("Cat")?".antigravity-cat-widget":".antigravity-dream-skin");}
function spawnApp(kind,flags=[]){
 const exe=resolveElectron(),dir=kindDir(kind),logDir=dataDir(kind);
 fs.mkdirSync(logDir,{recursive:true});
 const log=fs.openSync(path.join(logDir,"startup.log"),"a");
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,[path.join(dir,"src/main/index.cjs"),...flags],{cwd:root,env,detached:true,stdio:["ignore",log,log],windowsHide:false});
 fs.closeSync(log);child.unref();return child;
}
module.exports={root,KIND_DIR,kindDir,resolveElectron,dataDir,spawnApp};
if(require.main===module){
 const kind=process.argv[2]==="skin"?"skin":"widget";
 const flags=process.argv.slice(3).filter(f=>["--enable","--disable","--quit","--background"].includes(f));
 spawnApp(kind,flags);
}
