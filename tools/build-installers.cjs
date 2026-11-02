// Build independent Windows x64 installers from this sanitized public checkout.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const out=path.join(root,'dist/installers'),stage=path.join(root,'dist/installer-stage-'+Date.now());
const runtime=path.dirname(require('electron')),csc=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(stage,{recursive:true});
for(const [kind,project,exe] of [['Widget','Antigravity-Cat-Widget','StarWidget.exe'],['Skin','Antigravity-Dream-Skin','DreamSkin.exe']]){
 const dir=path.join(stage,kind),app=path.join(dir,'resources/app');
 fs.cpSync(runtime,dir,{recursive:true,filter:f=>path.basename(f)!=='default_app.asar'});
 fs.renameSync(path.join(dir,'electron.exe'),path.join(dir,exe));fs.mkdirSync(app,{recursive:true});
 for(const name of ['shared','LICENSE','NOTICE.md','ASSETS.md'])fs.cpSync(path.join(root,name),path.join(app,name),{recursive:true});
 for(const name of ['src','assets'])fs.cpSync(path.join(root,project,name),path.join(app,project,name),{recursive:true});
 // Public source assets only; no development references, user data, logs or runtime caches.
 if(fs.existsSync(path.join(app,project,'assets/references')))throw Error('Reference images must not enter installer');
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'star-suite-'+kind.toLowerCase(),version,main:project+'/src/main/index.cjs'}));
 const common=['/nologo','/target:winexe','/optimize+','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:Microsoft.CSharp.dll',...(kind==='Widget'?['/define:WIDGET']:[])];
 const sources=path.join(__dirname,'installer'),icon=path.join(app,project,'assets/app-icon.ico');
 execFileSync(csc,[...common,'/win32icon:'+icon,'/out:'+path.join(dir,'StartupSettings.exe'),path.join(sources,'StartupSettings.cs')],{stdio:'inherit'});
 if(kind==='Widget')execFileSync(csc,['/nologo','/target:exe','/optimize+','/out:'+path.join(app,project,'src/native/ForegroundHost.exe'),path.join(app,project,'src/native/ForegroundHost.cs')],{stdio:'inherit'});
 const zip=path.join(stage,kind+'.zip');
 execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('${dir.replaceAll("'","''")}','${zip.replaceAll("'","''")}')`],{stdio:'inherit'});
 const target=path.join(out,(kind==='Widget'?'StarWidget':'DreamSkin')+'-Setup-'+version+'-x64.exe');
 execFileSync(csc,[...common,'/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/win32icon:'+icon,'/main:SetupProgram','/resource:'+zip+',payload.zip','/out:'+target,path.join(sources,'StartupSettings.cs'),path.join(sources,'SetupProgram.cs')],{stdio:'inherit'});
 console.log(target);
}
