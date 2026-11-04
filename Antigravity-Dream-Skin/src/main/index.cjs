const{app,BrowserWindow,ipcMain,Tray,Menu,nativeImage}=require("electron"),path=require("node:path"),os=require("node:os");
const{DreamSkinSettings,DEFAULT_SETTINGS,legacyRotatePatch}=require("../domain/settings.cjs"),{WallpaperManager}=require("../domain/theme-loader.cjs"),{HostController}=require("../domain/host-controller.cjs");
const dataDir=process.argv.find(a=>a.startsWith("--data-dir="))?.slice(11)||path.join(os.homedir(),".antigravity-dream-skin");
app.setPath("userData",path.join(dataDir,"runtime"));app.setName("Gemini · Dream Skin");
if(!app.requestSingleInstanceLock())app.quit();
else if(process.argv.includes("--quit"))app.quit();
else{
 let win,tray,quitting=false,rotateTimer=null;
 const settings=new DreamSkinSettings(path.join(dataDir,"settings.json")),manager=new WallpaperManager({userDir:path.join(dataDir,"wallpapers")});
 if(process.argv.includes("--enable"))settings.update({enabled:true});
 if(process.argv.includes("--disable"))settings.update({enabled:false});
 const controller=new HostController(manager,()=>{if(win&&!win.isDestroyed())win.webContents.send("dream:state",snapshot());},{owner:"starsuite-desktop-host"});
 const snapshot=()=>{
  let wallpaper=null,wallpaperError=null,activeId=null;
  try{const pack=manager.verifyIntegrity(settings.get("wallpaperId"));wallpaper=pack.name;activeId=pack.id;}catch(error){wallpaperError=error.message;}
  const wallpapers=manager.listPacks().map(pack=>({id:pack.id,name:pack.name,width:pack.width,height:pack.height,error:pack.error||null,previewUrl:pack.previewUrl,active:pack.id===activeId}));
  return{settings:settings.getAll(),defaults:DEFAULT_SETTINGS,status:controller.status,wallpaper,wallpaperError,wallpapers};
 };
 // 壁纸轮播（分钟级，slideshow 单一真源）与旧字段一次性迁移。
 function rotateWallpaper(){
  const next=manager.nextId(settings.get("wallpaperId"));
  if(!next||next===settings.get("wallpaperId"))return;
  const pack=manager.listPacks().find(p=>p.id===next);
  settings.update({wallpaperId:next,wallpaperFile:pack?.file||""});
  controller.update(settings.getAll());
  if(win&&!win.isDestroyed())win.webContents.send("dream:state",snapshot());
 }
 function migrateLegacySettings(){
  if(settings.get("legacyMigrated")!==true){
   const patch=legacyRotatePatch(settings.getAll());
   if(patch)settings.update(patch);
   settings.update({legacyMigrated:true});
  }
  const packs=manager.listPacks(true).filter(p=>p.file);
  const file=settings.get("wallpaperFile"),currentId=settings.get("wallpaperId");
  const patch={};
  if(!file&&currentId){const pack=packs.find(p=>p.id===currentId);if(pack)patch.wallpaperFile=pack.file;}
  if(typeof file==="string"&&file){const pack=packs.find(p=>p.file&&path.resolve(p.file)===path.resolve(file));if(pack&&pack.id!==currentId)patch.wallpaperId=pack.id;}
  if(Object.keys(patch).length)settings.update(patch);
 }
 function scheduleSlideshow(){
  if(rotateTimer){clearInterval(rotateTimer);rotateTimer=null;}
  if(settings.get("slideshow")!==false){
   const minutes=Number(settings.get("slideshowIntervalMinutes"))||5;
   rotateTimer=setInterval(rotateWallpaper,Math.max(1,Math.min(60,minutes))*60000);
  }
 }
 function show(){
  if(win&&!win.isDestroyed()){win.show();win.focus();return;}
  win=new BrowserWindow({width:1240,height:850,minWidth:880,minHeight:650,autoHideMenuBar:true,title:"Gemini · Dream Skin",backgroundColor:"#f6f3fb",webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.loadFile(path.join(__dirname,"../renderer/index.html"));win.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  win.webContents.on("will-navigate",e=>e.preventDefault());
  win.on("close",e=>{if(!quitting&&settings.get("enabled")){e.preventDefault();win.hide();}});win.on("closed",()=>{win=null;if(!settings.get("enabled"))app.quit();});
 }
 const trusted=e=>win&&!win.isDestroyed()&&e.sender===win.webContents;
 ipcMain.handle("dream:get",e=>trusted(e)?snapshot():null);
 ipcMain.handle("dream:save",async(e,partial)=>{if(!trusted(e))return null;const allowed=Object.fromEntries(Object.entries(partial||{}).filter(([k])=>["outputMode","enabled","fit","scrim","opacity","positionX","positionY","zoom","wallpaperId","wallpaperFile","slideshow","slideshowIntervalMinutes"].includes(k)));settings.update(allowed);scheduleSlideshow();await controller.update(settings.getAll());return snapshot();});
 ipcMain.handle("dream:refresh",async e=>{if(!trusted(e))return null;await controller.tick();return snapshot();});
 ipcMain.on("dream:quit",e=>{if(trusted(e))app.quit();});
 app.on("second-instance",(_event,args)=>{if(args.includes("--quit")){app.quit();return;}if(args.includes("--enable")||args.includes("--disable")){settings.update({enabled:args.includes("--enable")});controller.update(settings.getAll());}if(!args.includes("--background"))show();});
 app.whenReady().then(()=>{
  if(!process.argv.includes("--background"))show();tray=new Tray(nativeImage.createFromPath(path.join(__dirname,"../../assets/app-icon.ico")));tray.setToolTip("Dream Skin");
  tray.setContextMenu(Menu.buildFromTemplate([{label:"打开皮肤设置",click:show},{label:"切换下一张壁纸",enabled:manager.usablePacks().length>1,click:rotateWallpaper},{type:"separator"},{label:"关闭皮肤并恢复原样",click:async()=>{settings.update({enabled:false});await controller.update(settings.getAll());}},{label:"退出并恢复原样",click:()=>app.quit()}]));tray.on("double-click",show);
  controller.start(settings.getAll());migrateLegacySettings();scheduleSlideshow();
 });
 app.on("before-quit",e=>{if(quitting)return;e.preventDefault();quitting=true;if(rotateTimer)clearInterval(rotateTimer);controller.stop().finally(()=>{tray?.destroy();app.quit();});});
 app.on("window-all-closed",()=>{if(!settings.get("enabled"))app.quit();});
}
