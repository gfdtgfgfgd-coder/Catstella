const {app,BrowserWindow,screen,Tray,Menu,ipcMain,nativeImage,globalShortcut,shell,powerMonitor}=require("electron");
const path=require("node:path"),os=require("node:os");
const {SettingsManager}=require("../domain/settings.cjs"),{UsageLedger}=require("../domain/ledger.cjs"),{WidgetStateMachine}=require("../domain/state-machine.cjs"),{TranscriptAdapter}=require("../adapters/transcript-adapter.cjs"),{AudioManager}=require("../domain/audio-manager.cjs");
const {HostQuotaAdapter}=require("../adapters/host-quota.cjs");
const {ForegroundMonitor,hostPlacement,characterPlacement,snapToEdges}=require("../domain/host-visibility.cjs");
// 星语皮肤并入同一实例：设置/壁纸/宿主主题化全部由挂件主进程托管，全局只保留一个托盘图标。
const {DreamSkinSettings,legacyRotatePatch}=require("../../../Antigravity-Dream-Skin/src/domain/settings.cjs"),{WallpaperManager}=require("../../../Antigravity-Dream-Skin/src/domain/theme-loader.cjs"),{HostController}=require("../../../Antigravity-Dream-Skin/src/domain/host-controller.cjs"),{LocalizationController}=require("../../../Antigravity-Dream-Skin/src/domain/localization-controller.cjs");
let localizationDict={};
try{const loaded=require("../../../Antigravity-Dream-Skin/assets/localization/zh-CN.json");for(const k of Object.keys(loaded))if(!k.startsWith("$"))localizationDict[k]=loaded[k];}catch{}
const skinDataDir=path.join(os.homedir(),".antigravity-dream-skin");
const dataDir=process.argv.find(a=>a.startsWith("--data-dir="))?.slice(11)||path.join(os.homedir(),".antigravity-cat-widget");
app.setPath("userData",path.join(dataDir,"runtime"));app.setName("喵言喵语桌宠");
// Transparent Chromium surfaces can stop presenting after GPU/desktop transitions.
app.disableHardwareAcceleration();
if(!app.requestSingleInstanceLock())app.quit();
else if(process.argv.includes("--quit"))app.quit();
else{
 let quitting=false,recoveryTimer,visualTimer,visualChecking=false,blankFrames=0,visualCheckInterval=15000,uptimeCheckTimer;
 const recoveryLog=reason=>{try{require("node:fs").appendFileSync(path.join(dataDir,"recovery.log"),new Date().toISOString()+" "+reason+"\n");}catch{}};
 let win,tray,panel,drag=null,source={online:false,source:"正在读取本机日志",files:0},saveTimer,displayScale=null,hostArea=null,hostLayout=null,dragTimer=null,facing="right",dockSide="",artShift=0,hostWasOnline=false,offlineTimer;
 const foreground=new ForegroundMonitor(),quotaAdapter=new HostQuotaAdapter();
 const dialogue=require("../../assets/dialogue/zh-CN.json");
 const running=new Set();
 const settings=new SettingsManager(path.join(dataDir,"settings.json")),ledger=new UsageLedger({storagePath:path.join(dataDir,"usage-v2.json")}),sm=new WidgetStateMachine("offline"),adapter=new TranscriptAdapter(),audio=new AudioManager();
 const skinSettings=new DreamSkinSettings(path.join(skinDataDir,"settings.json"));
 const skinManager=new WallpaperManager({userDir:path.join(skinDataDir,"wallpapers")});
 const skinController=new HostController(skinManager,()=>{publish();updateMenu();},{owner:"starsuite-desktop-host"});
 const localization=new LocalizationController(()=>{publish();},{dict:localizationDict});
 const WALLPAPER_TITLES={"01_chibi_star_16_9.jpg":"星语星空 · Q版基米乃","02_halloween_duo_16_9.jpg":"万圣双子 · 萌宠同框","03_catgirl_witch_16_9.jpg":"星空大魔女 · 骑行法杖"};
 let cachedCharacterPacks=null,cachedWallpapers=null,lastPackScan=0,lastWallScan=0;
 const getCharacterPacks=()=>{
  const now=Date.now();if(cachedCharacterPacks&&now-lastPackScan<15000)return cachedCharacterPacks;
  try{
   const fs=require("node:fs"),packsDir=path.join(__dirname,"../../assets/character-packs");
   if(!fs.existsSync(packsDir))return cachedCharacterPacks=[];
   const dirs=fs.readdirSync(packsDir,{withFileTypes:true}).filter(d=>d.isDirectory());
   cachedCharacterPacks=dirs.map(d=>{
    const manifestPath=path.join(packsDir,d.name,"manifest.json");let manifest={};
    try{manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));}catch{}
    const idleFrame=path.join(packsDir,d.name,manifest.frames?.idle?.src||"frames/idle.png");
    let preview="";try{if(fs.existsSync(idleFrame))preview=nativeImage.createFromPath(idleFrame).resize({width:160}).toDataURL();}catch{}
    return{id:d.name,name:manifest.name||d.name,description:manifest.description||(d.name==="lin-cat"?"居家水母冲锋衣 · 猫猫领口":"星空魔女礼装 · 异色瞳"),preview};
   });
   lastPackScan=now;return cachedCharacterPacks;
  }catch{return cachedCharacterPacks=[];}
 };
 const getWallpapers=()=>{
  const now=Date.now();if(cachedWallpapers&&now-lastWallScan<15000)return cachedWallpapers;
  try{
   const fs=require("node:fs");
   cachedWallpapers=skinManager.listPacks(true).filter(pack=>pack.file).map(pack=>{
    let preview="";
    try{preview=nativeImage.createFromPath(pack.file).resize({width:280}).toDataURL();}catch{}
    const fileName=path.basename(pack.file);
    return{id:pack.id,fileName,filePath:pack.file,title:WALLPAPER_TITLES[fileName]||pack.name,preview};
   });
   lastWallScan=now;return cachedWallpapers;
  }catch{return cachedWallpapers=[];}
 };
 // 立绘指纹：帧图内容一变（升级/换图）URL 版本号自动失效 Chromium 文件缓存，根治"偶尔变回老立绘"。
 let cachedArtVersion=null,lastArtScan=0;
 const getArtVersion=()=>{
  const now=Date.now();if(cachedArtVersion&&now-lastArtScan<15000)return cachedArtVersion;
  try{
   const fs=require("node:fs"),crypto=require("node:crypto"),packsDir=path.join(__dirname,"../../assets/character-packs");
   const parts=[];
   const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else{const st=fs.statSync(full);parts.push(entry.name+":"+st.size+":"+st.mtimeMs);}
   }};
   walk(packsDir);
   cachedArtVersion=crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0,10);
  }catch{cachedArtVersion="0";}
  lastArtScan=now;return cachedArtVersion;
 };
 const snapshot=()=>{ledger.quotaRemainingPercent=settings.get("manualQuota")===true?settings.get("manualPercent"):null;return{artShift,dockSide,quotaWindows:quotaAdapter.snapshot,facing,state:sm.currentState,persistentState:sm.persistentState,dialogue:dialogue.lines,settings:settings.getAll(),dreamSkin:skinSettings.getAll(),skinStatus:skinController.status,characterPacks:getCharacterPacks(),wallpapers:getWallpapers(),artVersion:getArtVersion(),displayScale:displayScale||settings.get("scale"),visibility:{supported:process.platform==="win32",foreground:foreground.state.kind,nativeAttached:foreground.state.attached===true,withinHost:!!hostArea},ledger:ledger.getSnapshot(),source,presets:audio.getPresetList()};};
 const send=(channel,data)=>{for(const w of [win,panel])if(w&&!w.isDestroyed())w.webContents.send(channel,data);};
 const publish=()=>send("widget:snapshot",snapshot());
 function syncQuotaState(){if(["idle","warning"].includes(sm.persistentState))sm.setPersistentState((settings.get("manualQuota")?[settings.get("manualPercent"),settings.get("manualWeeklyPercent")]:[quotaAdapter.snapshot.fiveHour,quotaAdapter.snapshot.weekly]).some(v=>typeof v==="number"&&v<=20)?"warning":"idle");}
 // 壁纸轮播（分钟级，上游 slideshow 语义）与旧字段一次性迁移。
 let slideshowTimer=null;
 function rotateWallpaper(){
  const next=skinManager.nextId(skinSettings.get("wallpaperId"));
  const pack=next?skinManager.listPacks().find(p=>p.id===next):null;
  if(!next||next===skinSettings.get("wallpaperId"))return;
  skinSettings.update({wallpaperId:next,wallpaperFile:pack?.file||""});
  skinController.update(skinSettings.getAll());
 }
 function scheduleSlideshow(){
  if(slideshowTimer){clearInterval(slideshowTimer);slideshowTimer=null;}
  if(skinSettings.get("slideshow")!==false){
   const minutes=Number(skinSettings.get("slideshowIntervalMinutes"))||5;
   slideshowTimer=setInterval(rotateWallpaper,Math.max(1,Math.min(60,minutes))*60000);
  }
 }
 function migrateLegacyDreamSettings(){
  if(skinSettings.get("legacyMigrated")!==true){
   const patch=legacyRotatePatch(skinSettings.getAll());
   if(patch)skinSettings.update(patch);
   skinSettings.update({legacyMigrated:true});
  }
  const packs=skinManager.listPacks(true).filter(p=>p.file);
  const file=skinSettings.get("wallpaperFile"),currentId=skinSettings.get("wallpaperId");
  const patch={};
  if(!file&&currentId){const pack=packs.find(p=>p.id===currentId);if(pack)patch.wallpaperFile=pack.file;}
  if(typeof file==="string"&&file){const pack=packs.find(p=>p.file&&path.resolve(p.file)===path.resolve(file));if(pack&&pack.id!==currentId)patch.wallpaperId=pack.id;}
  if(Object.keys(patch).length)skinSettings.update(patch);
 }
 function bounds(size=settings.get("scale")){return{width:Math.max(360,size+80),height:Math.round(size*1146/1372+340)};}
 function safePosition(x,y,w,h){const area=screen.getDisplayNearestPoint({x:Number.isFinite(x)?x:screen.getPrimaryDisplay().workArea.x,y:Number.isFinite(y)?y:0}).workArea;return{x:Math.round(Number.isFinite(x)?Math.max(area.x,Math.min(area.x+area.width-w,x)):area.x+area.width-w-18),y:Math.round(Number.isFinite(y)?Math.max(area.y,Math.min(area.y+area.height-h,y)):area.y+area.height-h-18)};}
 // 宿主消失时优雅退守：恢复独立桌面尺寸与位置（用户最后的自由坐标，缺省右下角），绝不闪退或强行隐藏。
 function degradeToStandalone(){
  if(!win||win.isDestroyed())return;
  hostArea=null;hostLayout=null;displayScale=settings.get("scale");artShift=0;dockSide="";
  const dim=bounds(),pos=safePosition(settings.get("x"),settings.get("y"),dim.width,dim.height);
  win.setBounds({...pos,...dim});
  win.setAlwaysOnTop(settings.get("alwaysOnTop"));
  if(!win.isVisible())win.showInactive();
  win.setIgnoreMouseEvents(settings.get("clickThrough"),{forward:true});
  updateMenu();
 }
 function syncVisibility(){
  if(!win||win.isDestroyed())return;
  if(!settings.get("hostWindowOnly")){
   hostArea=null;hostLayout=null;displayScale=settings.get("scale");
   if(!win.isVisible())win.showInactive();
   return;
  }
  if(drag)return;
  const previousArea=hostArea;let state=foreground.state;
  if(state.bounds)state={...state,bounds:screen.screenToDipRect(null,state.bounds)};
  const placement=hostPlacement(state,settings.get("scale"),settings.get("hostOffsetX"),settings.get("hostOffsetY"),settings.get("hostDock"));

  // Host unavailable (hidden/minimized/too small): never crash or force-hide.
  // Standalone mode degrades gracefully to a free-floating desktop pet.
  if(!placement){
   const wasFollowing=!!hostArea;
   hostArea=null;hostLayout=null;
   if(drag){drag=null;sm.handlePointerUp();}
   if(settings.get("standaloneDesktopMode")){
    if(wasFollowing||!win.isVisible())degradeToStandalone();
    publish();return;
   }
   if(win.isVisible())win.hide();
   return;
  }

  // Host is available - show widget and update position
  win.setAlwaysOnTop(false);
  hostArea=state.bounds;displayScale=placement.scale;artShift=placement.artShift;
  dockSide=Math.abs(placement.visualX-hostArea.x)<2?"left":Math.abs(placement.visualX+displayScale-hostArea.x-hostArea.width)<2?"right":"";
  facing=placement.visualX+displayScale/2<hostArea.x+hostArea.width/2?"left":"right";
  const nextLayout=JSON.stringify([state.hostId,state.restoreGeneration,displayScale,hostArea.width,hostArea.height,settings.get("hostOffsetX"),settings.get("hostOffsetY"),settings.get("hostDock")]);
  const nativeTranslation=state.nativeFollowing&&previousArea&&hostLayout===nextLayout;
  const layoutChanged=hostLayout!==nextLayout;
  hostLayout=nextLayout;
  const old=win.getBounds(),stationary=nativeTranslation&&previousArea&&previousArea.x===hostArea.x&&previousArea.y===hostArea.y;
  if((!nativeTranslation||stationary)&&Object.keys(placement.bounds).some(key=>Math.abs(old[key]-placement.bounds[key])>2))win.setBounds(placement.bounds);

  // Ensure widget is visible when host is available
  if(!win.isVisible()){
   win.showInactive();
   // After restore, trigger compositor refresh to avoid blank rendering - optimized delay
   if(layoutChanged)setTimeout(()=>{
     if(win&&!win.isDestroyed()){
       win.webContents.send('widget:preload-frames');
       win.webContents.invalidate();
     }
   },50);
  }
  return !nativeTranslation;
 }
 function show(){
  if(!win||win.isDestroyed())createWindow();
  if(settings.get("hostWindowOnly"))foreground.start(win.getNativeWindowHandle());
  // The widget must enter the visible state exactly once. From then on the native
  // helper controls z-order without hiding or moving the surface off-screen.
  if(!win.isVisible()){win.show();win.setAlwaysOnTop(true,"screen-saver");win.moveTop();}
  syncVisibility();
  win.setIgnoreMouseEvents(settings.get("clickThrough"),{forward:true});
 }
 function apply(partial){
  const allowed=["characterPack","scale","alwaysOnTop","reducedMotion","sound","volume","soundSet","bubbleOn","turnCostOn","turnCostDurationMs","clickThrough","snap","bubblePage","manualQuota","manualPercent","manualWeeklyPercent","hostWindowOnly","standaloneDesktopMode","clickCatAction","easterEggs"];
  const oldScale=settings.get("scale"),oldHostOnly=settings.get("hostWindowOnly");
  if(!oldHostOnly&&partial?.hostWindowOnly===true&&win){const pos=win.getBounds();settings.update({x:pos.x,y:pos.y});}
  settings.update(Object.fromEntries(Object.entries(partial||{}).filter(([k])=>allowed.includes(k))));
  if(partial?.dreamSkin&&typeof partial.dreamSkin==="object"&&!Array.isArray(partial.dreamSkin)){
   const dream={...partial.dreamSkin};
   // 壁纸画廊走 wallpaperFile 选择；同步解析为壁纸包 id 供主题负载使用。
   if(typeof dream.wallpaperFile==="string"&&dream.wallpaperFile){
    const pack=skinManager.listPacks().find(p=>p.file&&path.resolve(p.file)===path.resolve(dream.wallpaperFile));
    if(pack)dream.wallpaperId=pack.id;
   }
   delete dream.legacyMigrated;
   skinSettings.update(dream);
   cachedWallpapers=null;lastWallScan=0;
   skinController.update(skinSettings.getAll());
   localization.update(skinSettings.getAll());
   scheduleSlideshow();
  }
  syncQuotaState();
  if(settings.get("hostWindowOnly"))foreground.start(win?.getNativeWindowHandle());else foreground.stop();
  if(win){if(!settings.get("hostWindowOnly")&&(settings.get("scale")!==oldScale||oldHostOnly)){const old=win.getBounds(),dim=bounds();const pos=oldHostOnly?safePosition(settings.get("x"),settings.get("y"),dim.width,dim.height):safePosition(old.x+old.width-dim.width,old.y+old.height-dim.height,dim.width,dim.height);win.setBounds({...pos,...dim});}win.setAlwaysOnTop(!settings.get("hostWindowOnly")&&settings.get("alwaysOnTop"));win.setIgnoreMouseEvents(settings.get("clickThrough"),{forward:true});syncVisibility();}
  audio.setEnabled(settings.get("sound"));audio.setVolume(settings.get("volume"));audio.setPreset(settings.get("soundSet"));publish();updateMenu();return snapshot();
 }
 function openSettings(){
  if(panel&&!panel.isDestroyed()){panel.show();panel.focus();return;}
  // 无边框自绘标题栏设置中心（用户 fork 设计）：拖拽区 + 最小化/关闭按钮。
  panel=new BrowserWindow({width:900,height:700,minWidth:760,minHeight:560,frame:false,transparent:true,hasShadow:true,resizable:true,autoHideMenuBar:true,title:"喵言喵语 · 设置中心",backgroundColor:"#00000000",webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  panel.loadFile(path.join(__dirname,"../renderer/settings.html"));panel.on("closed",()=>panel=null);
 }
 function reset(){if(settings.get("hostWindowOnly")){settings.update({hostOffsetX:18,hostOffsetY:18,hostDock:""});syncVisibility();publish();return;}const dim=bounds(),pos=safePosition(null,null,dim.width,dim.height);win.setBounds({...pos,...dim});settings.update(pos);show();}
 function recall(){show();win?.show();win?.setAlwaysOnTop(true,"screen-saver");win?.moveTop();if(settings.get("hostWindowOnly")&&!win?.isVisible())openSettings();}
 function updateMenu(){
  if(!tray)return;
  tray.setContextMenu(Menu.buildFromTemplate([{label:"喵言喵语 · 星语套件",enabled:false},{label:"显示 / 唤回挂件",click:recall},{label:"重启套件",click:()=>{app.relaunch();app.quit();}},{label:"统一设置中心",click:openSettings},{type:"separator"},
  {label:"应用到 Antigravity（皮肤）",type:"checkbox",checked:skinSettings.get("enabled")===true,click:()=>{skinSettings.update({enabled:skinSettings.get("enabled")!==true});skinController.update(skinSettings.getAll());publish();}},
  {label:"切换下一张壁纸",click:()=>{rotateWallpaper();publish();}},{type:"separator"},
  {label:"仅在 Antigravity 窗口内显示",type:"checkbox",checked:settings.get("hostWindowOnly"),click:()=>apply({hostWindowOnly:!settings.get("hostWindowOnly")})},
  {label:"无宿主时退守桌面显示",type:"checkbox",enabled:settings.get("hostWindowOnly"),checked:settings.get("hostWindowOnly")&&settings.get("standaloneDesktopMode"),click:()=>apply({standaloneDesktopMode:!settings.get("standaloneDesktopMode")})},
  {label:"显示气泡",type:"checkbox",checked:settings.get("bubbleOn"),click:()=>apply({bubbleOn:!settings.get("bubbleOn")})},
  {label:"桌面模式始终置顶",type:"checkbox",enabled:!settings.get("hostWindowOnly"),checked:!settings.get("hostWindowOnly")&&settings.get("alwaysOnTop"),click:()=>apply({alwaysOnTop:!settings.get("alwaysOnTop")})},
  {label:"鼠标穿透 · Ctrl+Alt+Shift+G 恢复",type:"checkbox",checked:settings.get("clickThrough"),click:()=>apply({clickThrough:!settings.get("clickThrough")})},
  {label:"停靠左下角",click:()=>dock("left")},{label:"停靠右下角",click:()=>dock("right")},{label:"重置位置",click:reset},{type:"separator"},{label:"退出喵言喵语",click:()=>app.quit()}]));
 }
 function createWindow(){
  const dim=bounds(),pos=safePosition(settings.get("x"),settings.get("y"),dim.width,dim.height);
  win=new BrowserWindow({...dim,...pos,frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:!settings.get("hostWindowOnly")&&settings.get("alwaysOnTop"),show:false,
   webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.loadFile(path.join(__dirname,"../renderer/index.html"));win.once("ready-to-show",show);win.on("closed",()=>{foreground.stop();win=null;if(!quitting)setTimeout(show,250);});
  win.webContents.setWindowOpenHandler(()=>({action:"deny"}));win.webContents.on("will-navigate",e=>e.preventDefault());
  win.webContents.on("render-process-gone",()=>{if(!quitting&&win&&!win.isDestroyed())win.destroy();});
  win.webContents.on("did-finish-load",()=>{blankFrames=0;publish();});
  let unresponsiveTimer;
  win.on("unresponsive",()=>{const stuck=win;clearTimeout(unresponsiveTimer);unresponsiveTimer=setTimeout(()=>{if(!quitting&&win===stuck&&!stuck.isDestroyed())stuck.destroy();},10000);});
  win.on("responsive",()=>clearTimeout(unresponsiveTimer));win.on("closed",()=>clearTimeout(unresponsiveTimer));
 }
 function trusted(e){return[win,panel].some(w=>w&&!w.isDestroyed()&&e.sender===w.webContents);}
 ipcMain.handle("widget:get",e=>trusted(e)?snapshot():null);
 ipcMain.handle("widget:settings",(e,v)=>trusted(e)?apply(v):null);
 ipcMain.on("widget:command",(e,command)=>{
  if(!trusted(e))return;
  if(command==="settings")openSettings();
  else if(command==="settings-close")panel?.close();
  else if(command==="settings-minimize")panel?.minimize();
  else if(command==="refresh-state"||command==="refresh"){
   cachedCharacterPacks=null;lastPackScan=0;cachedWallpapers=null;lastWallScan=0;
   win?.webContents.session.clearCache();
   win?.webContents.reloadIgnoringCache();
   quotaAdapter.tick();
   publish();
   if(panel&&!panel.isDestroyed())panel.webContents.send("widget:snapshot",snapshot());
  }
  else if(command==="open-character-dir"){
   const dir=path.join(__dirname,"../../assets/character-packs");
   require("node:fs").mkdirSync(dir,{recursive:true});
   shell.openPath(dir);
  }
  else if(command==="open-wallpaper-dir"){
   const dir=path.join(skinDataDir,"wallpapers");
   require("node:fs").mkdirSync(dir,{recursive:true});
   shell.openPath(dir);
  }
  else if(command==="next-wallpaper"){rotateWallpaper();publish();}
  else if(command==="menu")tray?.popUpContextMenu();
  else if(command==="quit")app.quit();
  else if(command==="reset")reset();
  else if(command==="dock-left")dock("left");else if(command==="dock-right")dock("right");
  else if(command==="show-bubble")apply({bubbleOn:true});
  else if(command==="preview-reaction")send("widget:reaction",{});
  else if(command&&command.startsWith("preview-reaction"))send("widget:reaction",command.includes(":")?command.split(":")[1]:{});
  else if(command==="quota-refresh")quotaAdapter.openNativeQuota().catch(()=>{});
 });
 function dragMove(point){
  if(!drag||!win)return;const p=point||drag.last,dx=p.x-drag.point.x,dy=p.y-drag.point.y;
  drag.last=p;if(!drag.moved&&Math.hypot(dx,dy)<=8)return;
  if(!drag.moved){drag.moved=true;sm.handleDragStart();}
  const a=hostArea||screen.getDisplayNearestPoint(p).workArea,size=displayScale||settings.get("scale");
  const placement=characterPlacement(a,size,drag.bounds,drag.visualX+dx,drag.bounds.y+dy);
  win.setBounds(placement.bounds);artShift=placement.artShift;dockSide="";
  facing=placement.visualX+size/2<a.x+a.width/2?"left":"right";publish();
 }
 function dock(side){
  if(!win)return;if(settings.get("hostWindowOnly"))syncVisibility();
  const size=displayScale||settings.get("scale"),b={...win.getBounds(),...bounds(size)},a=hostArea||screen.getDisplayMatching(b).workArea;
  const placement=characterPlacement(a,size,b,side==="left"?a.x:a.x+a.width-size,a.y+a.height-b.height);
  win.setBounds(placement.bounds);artShift=placement.artShift;dockSide=side;facing=side;
  if(hostArea)settings.update({hostOffsetX:side==="left"?a.width-size:0,hostOffsetY:0,hostDock:side});else settings.update({x:placement.bounds.x,y:placement.bounds.y});publish();
 }
 ipcMain.handle("widget:pointer",(e,payload)=>{
  const action=typeof payload==="string"?payload:payload?.action,raw=payload?.point,point=raw&&Number.isFinite(raw.x)&&Number.isFinite(raw.y)&&Math.abs(raw.x)<100000&&Math.abs(raw.y)<100000?{x:raw.x,y:raw.y}:null;
  if(!trusted(e)||!win)return{moved:false};
  if(action==="down"){clearInterval(dragTimer);win.setIgnoreMouseEvents(false);const start=point||screen.getCursorScreenPoint();drag={point:start,last:start,bounds:{...win.getBounds(),...bounds(displayScale||settings.get("scale"))},visualX:win.getBounds().x+(bounds(displayScale||settings.get("scale")).width-(displayScale||settings.get("scale")))/2+artShift,moved:false};sm.handlePointerDown();}
  else if(action==="move"&&point)dragMove(point);
  else if(action==="up"||action==="cancel"){
   clearInterval(dragTimer);dragTimer=null;if(!drag)return{moved:false};dragMove();const moved=drag.moved;drag=null;
   if(moved){const size=displayScale||settings.get("scale"),old={...win.getBounds(),...bounds(size)},area=hostArea||screen.getDisplayMatching(old).workArea;
    let visualX=old.x+(old.width-size)/2+artShift,y=old.y;
    if(settings.get("snap"))({visualX,y}=snapToEdges(area,size,old.height,visualX,y));
    const placement=characterPlacement(area,size,old,visualX,y);win.setBounds(placement.bounds);artShift=placement.artShift;
    dockSide=Math.abs(visualX-area.x)<2?"left":Math.abs(visualX+size-area.x-area.width)<2?"right":"";
    facing=visualX+size/2<area.x+area.width/2?"left":"right";
    if(hostArea)settings.update({hostDock:dockSide,hostOffsetX:Math.max(0,hostArea.x+hostArea.width-placement.visualX-size),hostOffsetY:Math.max(0,hostArea.y+hostArea.height-placement.bounds.y-old.height)});else settings.update({x:placement.bounds.x,y:placement.bounds.y});
   }sm.handlePointerUp();return{moved};
  }else if(action==="pet")sm.handlePetting();
  return{moved:!!drag?.moved};
 });
 ipcMain.on("widget:hit",(e,interactive)=>{if(trusted(e)&&win&&!drag)win.setIgnoreMouseEvents(settings.get("clickThrough")||interactive!==true,{forward:true});});
 ipcMain.handle("widget:audio",(e,type)=>trusted(e)&&["press","release"].includes(type)?audio.getAudioFile(type):null);
 quotaAdapter.on("change",()=>{syncQuotaState();publish();});
 sm.subscribe(publish);
 foreground.on("change",()=>{if(syncVisibility()!==false)publish();});
 adapter.on("turnDone",step=>{
  const recorded=ledger.recordStep(step);
  running.delete(step.sessionId+":"+step.step_index);
  if(!step.historical){sm.setPersistentState(running.size?"thinking":"idle");syncQuotaState();}
  if(recorded){clearTimeout(saveTimer);saveTimer=setTimeout(()=>ledger.save(),1000);if(!step.historical&&!recorded.updated){sm.handleTurnSuccess();send("widget:step",recorded);}}
 });
 adapter.on("turnRunning",s=>{if(!s.historical){running.add(s.sessionId+":"+s.stepIndex);sm.setPersistentState("thinking");}});
 adapter.on("turnError",s=>{running.delete(s.sessionId+":"+s.stepIndex);if(!s.historical)sm.setPersistentState("error");});
 adapter.on("status",status=>{source=status;if(!status.online)sm.setPersistentState("offline");else if(sm.persistentState==="offline")sm.setPersistentState(running.size?"thinking":"idle");syncQuotaState();publish();});
 app.on("second-instance",(_event,args)=>{
  if(args.includes("--quit")){app.quit();return;}
  if(args.includes("--settings")){openSettings();return;}
  if(args.includes("--enable")||args.includes("--disable")){skinSettings.update({enabled:args.includes("--enable")});skinController.update(skinSettings.getAll());publish();}
  if(!args.includes("--background"))recall();
 });
 app.whenReady().then(()=>{
  createWindow();
  if(process.argv.includes("--settings"))openSettings();
  try{tray=new Tray(nativeImage.createFromPath(path.join(__dirname,"../../assets/character-packs/gemini-star-v1/frames/idle.png")).resize({width:24,height:24}));
  tray.setToolTip("喵言喵语 · 星语套件");tray.on("double-click",recall);updateMenu();}catch(error){recoveryLog("tray-init-failed "+error.message);}
  migrateLegacyDreamSettings();
  skinController.start(skinSettings.getAll());
  localization.start();
  scheduleSlideshow();
  globalShortcut.register("CommandOrControl+Alt+G",recall);globalShortcut.register("CommandOrControl+Alt+Shift+G",()=>{apply({clickThrough:false});recall();});
  if(settings.get("hostWindowOnly"))foreground.start(win?.getNativeWindowHandle());
  audio.setEnabled(settings.get("sound"));audio.setVolume(settings.get("volume"));audio.setPreset(settings.get("soundSet"));adapter.start();quotaAdapter.start();
  recoveryTimer=setInterval(()=>{if(!win||win.isDestroyed()){show();return;}if(settings.get("hostWindowOnly"))foreground.start(win.getNativeWindowHandle());},2000);
  // Adaptive visual check interval based on uptime
  uptimeCheckTimer=setInterval(()=>{
   const uptime=process.uptime();
   visualCheckInterval=uptime>=7200?120000:uptime>=3600?60000:15000;
  },300000); // Check every 5 minutes
  let lastVisualCheck=0;
  visualTimer=setInterval(async()=>{
   if(Date.now()-lastVisualCheck<visualCheckInterval)return;
   lastVisualCheck=Date.now();
   if(visualChecking||drag||!win||win.isDestroyed()||!win.isVisible()||(settings.get("hostWindowOnly")&&!hostArea))return;
   visualChecking=true;const checked=win;
   try{
    const healthy=await Promise.race([checked.webContents.executeJavaScript(`(()=>{const face=document.querySelector('.agy-face');if(!face)return false;const r=face.getBoundingClientRect();if(r.width<20||r.height<20)return false;let node=face;while(node){const s=getComputedStyle(node);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;node=node.parentElement;}return [...face.querySelectorAll('img')].some(img=>img.complete&&img.naturalWidth>0&&Number(getComputedStyle(img).opacity)>0);})()`),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error("renderer-check-timeout")),4000);timer.unref();})]);
    if(!healthy){recoveryLog("invalid-character-layout-recreate");checked.destroy();return;}
    const frame=await Promise.race([checked.webContents.capturePage(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error("capture-timeout")),4000);timer.unref();})]);
    const pixels=frame.toBitmap();let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>32)opaque++;
    blankFrames=opaque<500?blankFrames+1:0;
    if(blankFrames>=2&&win===checked&&!checked.isDestroyed()){recoveryLog("blank-surface-recreate opaque="+opaque);checked.destroy();}
   }catch(error){if(win===checked&&!checked.isDestroyed()){recoveryLog("surface-check-recreate "+error.message);checked.destroy();}}
   finally{visualChecking=false;}
  },15000); // Gate checks using the current adaptive interval
  const resume=()=>{drag=null;hostLayout=null;foreground.stop();show();publish();
   if(win&&!win.isDestroyed()){
     win.webContents.send('widget:force-repaint');
     win.webContents.invalidate();
   }
  };
  powerMonitor.on("resume",resume);powerMonitor.on("unlock-screen",resume);
  screen.on("display-removed",reset);
  screen.on("display-metrics-changed",()=>{if(settings.get("hostWindowOnly")){syncVisibility();publish();}});
 });
 app.on("before-quit",()=>{quitting=true;clearInterval(visualTimer);clearInterval(recoveryTimer);clearInterval(dragTimer);if(slideshowTimer)clearInterval(slideshowTimer);foreground.stop();adapter.stop();quotaAdapter.stop();skinController.stop();localization.stop();sm.destroy();clearTimeout(saveTimer);ledger.save();globalShortcut.unregisterAll();tray?.destroy();});
 app.on("window-all-closed",()=>{if(!tray)app.quit();});
}


