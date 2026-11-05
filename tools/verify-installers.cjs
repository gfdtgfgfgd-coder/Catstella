const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {_electron}=require('playwright');
const {detectWebCompanion}=require('./web-companion-path.cjs');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const testRoot=fs.mkdtempSync(path.join(root,'dist','安装验证-')),checks=[];
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
(async()=>{
 for(const [kind,name,exe] of [['Suite','Catstella','StarSuite.exe']]){
  const setup=path.join(root,'dist/installers',name+'-Setup-'+version+'-x64.exe'),dir=path.join(testRoot,kind);
  // Inno 静默沙箱安装：全组件 + 无任务（自启动/联动标志不写入测试机）。
  execFileSync(setup,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/DIR='+dir,'/COMPONENTS=core,webext','/TASKS='],{env,timeout:300000});
  assert(fs.existsSync(path.join(dir,exe)));assert.equal(fs.readFileSync(path.join(dir,'.starsuite-install'),'utf8').trim(),kind);
  assert(fs.existsSync(path.join(dir,'LICENSES.chromium.html')));assert(fs.existsSync(path.join(dir,'resources/app/NOTICE.md')));
  assert(fs.existsSync(path.join(dir,'resources/app/Antigravity-Cat-Widget/src/main/index.cjs')));
  assert(fs.existsSync(path.join(dir,'resources/app/Antigravity-Dream-Skin/src/domain/host-controller.cjs')));
  assert(fs.existsSync(path.join(dir,'resources/app/Antigravity-Dream-Skin/src/host/theme.cjs')));
  assert(!fs.existsSync(path.join(dir,'resources/app/Antigravity-Dream-Skin/src/main')),'Legacy Dream Skin main process must not ship');
  assert(!fs.existsSync(path.join(dir,'resources/app/Antigravity-Dream-Skin/src/renderer')),'Legacy Dream Skin control window must not ship');
  assert(!fs.existsSync(path.join(dir,'locales')),'Chromium locale packs must not ship');
  assert(!fs.existsSync(path.join(dir,'GeneratedVersion.cs')),'Build-only version source must not ship');
  assert(!fs.existsSync(path.join(dir,'IconSwap.exe')),'Build-only icon helper must not ship');
  assert(fs.existsSync(path.join(dir,'icons/launch.ico')));assert(fs.existsSync(path.join(dir,'icons/settings.ico')));assert(fs.existsSync(path.join(dir,'icons/uninstall.ico')));
  assert(fs.existsSync(path.join(dir,'web-extension/web-plugin-guide.html')));
  const web=detectWebCompanion();
  const expectWebExt=!!(web&&fs.existsSync(path.join(web.dist,'kimino-gemini-companion.xpi')));
  if(expectWebExt){
   // 刚解压完成的文件偶发被杀软短暂扫描锁定，轮询容忍后再断言。
   let xpiSeen=false;
   for(let i=0;i<10&&!xpiSeen;i++){xpiSeen=fs.existsSync(path.join(dir,'web-extension/kimino-gemini-companion.xpi'));if(!xpiSeen)await new Promise(r=>setTimeout(r,1000));}
   assert(xpiSeen);
  }
  assert(!fs.existsSync(path.join(dir,'resources/app/Gemini-Web-Companion')));
  const appDir=path.join(dir,'resources/app');
  assert.equal(JSON.parse(fs.readFileSync(path.join(appDir,'package.json'),'utf8')).byokDevelopment,false);
  assert(!fs.existsSync(path.join(appDir,'shared/gateway')),'The release must exclude the experimental gateway');
  assert(!fs.existsSync(path.join(appDir,'Antigravity-Dream-Skin/src/host/byok-portal.cjs')));
  assert(!fs.readdirSync(path.join(dir,'resources/app/Antigravity-Cat-Widget/src/native')).some(file=>/^ForegroundHost\.[0-9a-f]{12}\.exe$/i.test(file)), 'Development helper caches must not ship');
  assert(!fs.existsSync(path.join(dir,'node_modules')));checks.push(kind+': Inno silent install in non-ASCII directory; licenses, both suite projects, expression icons and webext component');
  execFileSync(path.join(dir,'StartupSettings.exe'),['--self-test'],{env,timeout:15000,windowsHide:true,encoding:'utf8'});
  checks.push(kind+': autostart/link flags, host transition decision, and temporary registry cleanup');
  const app=await _electron.launch({executablePath:path.join(dir,exe),args:['--data-dir='+path.join(testRoot,kind+'-profile')],env,timeout:30000});
  try{
   const page=await app.firstWindow();await page.waitForFunction(()=>window.widgetApi,{},{timeout:20000});
   const state=await page.evaluate(async()=>await window.widgetApi.get());assert(state.settings);assert(state.dreamSkin);assert(Array.isArray(state.wallpapers));
   assert.equal(state.byok.available,false);
   assert.equal(await page.evaluate(()=>typeof window.widgetApi.byok),'undefined');
   await page.screenshot({path:path.join(root,'evidence','installer-'+kind+'.png')});checks.push(kind+': installed EXE opens unified renderer without Node or source workspace');
  }finally{
   await app.close();
   // playwright 的 close() 可能只断开连接留下孤儿进程锁住安装目录；按测试 data-dir 精准清理（不触碰真实实例）。
   await new Promise(r=>setTimeout(r,2000));
   const pattern=testRoot.replace(/\\/g,'\\\\');
   execFileSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process -Filter \"Name='StarSuite.exe'\" | Where-Object { $_.CommandLine -like '*"+pattern+"*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],{env,timeout:30000});
   await new Promise(r=>setTimeout(r,1500));
  }
  // Inno 卸载器（.iss 内会先 --quit 优雅退出；unins000 可能短暂换体运行，轮询目录消失）。
  execFileSync(path.join(dir,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],{env,timeout:120000});
  for(let i=0;i<45&&fs.existsSync(dir);i++)await new Promise(r=>setTimeout(r,1000));
  assert(!fs.existsSync(dir));checks.push(kind+': Inno uninstaller removes only the install directory');
 }
 const report={checkedAt:new Date().toISOString(),version,result:'pass',checks,secondComputerVerified:false};
 fs.writeFileSync(path.join(root,'evidence/installer-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
