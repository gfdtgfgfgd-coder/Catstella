const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {_electron}=require('playwright');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const testRoot=fs.mkdtempSync(path.join(root,'dist','安装验证-')),checks=[];
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
(async()=>{
 for(const [kind,name,exe] of [['Widget','StarWidget','StarWidget.exe'],['Skin','DreamSkin','DreamSkin.exe']]){
  const setup=path.join(root,'dist/installers',name+'-Setup-'+version+'-x64.exe'),dir=path.join(testRoot,kind);
  execFileSync(setup,['--sandbox-install',dir],{env,timeout:180000});
  assert(fs.existsSync(path.join(dir,exe)));assert.equal(fs.readFileSync(path.join(dir,'.starsuite-install'),'utf8'),kind);
  assert(fs.existsSync(path.join(dir,'LICENSES.chromium.html')));assert(fs.existsSync(path.join(dir,'resources/app/NOTICE.md')));
  assert(!fs.existsSync(path.join(dir,'resources/app',kind==='Widget'?'Antigravity-Dream-Skin':'Antigravity-Cat-Widget')));
  assert(!fs.existsSync(path.join(dir,'node_modules')));checks.push(kind+': self-contained extraction in non-ASCII directory; licenses and independent payload');
  execFileSync(path.join(dir,'StartupSettings.exe'),['--self-test'],{env,timeout:15000});checks.push(kind+': autostart/link flags, host transition decision, isolated HKCU Run cleanup');
  const app=await _electron.launch({executablePath:path.join(dir,exe),args:['--data-dir='+path.join(testRoot,kind+'-profile')],env,timeout:30000});
  try{
   const page=await app.firstWindow();await page.waitForFunction(()=>window.widgetApi||window.dreamApi,{},{timeout:20000});
   const state=await page.evaluate(async()=>window.widgetApi?await window.widgetApi.get():await window.dreamApi.get());assert(state.settings);
   await page.screenshot({path:path.join(root,'evidence','installer-'+kind+'.png')});checks.push(kind+': installed EXE opens real renderer without Node or source workspace');
  }finally{await app.close();}
  const worker=path.join(testRoot,kind+'-uninstall.exe');fs.copyFileSync(path.join(dir,'StartupSettings.exe'),worker);
  execFileSync(worker,['--remove-root',dir],{env,timeout:30000});assert(!fs.existsSync(dir));checks.push(kind+': uninstall worker removes only marked install directory');
 }
 const report={checkedAt:new Date().toISOString(),version,result:'pass',checks,secondComputerVerified:false};
 fs.writeFileSync(path.join(root,'evidence/installer-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
