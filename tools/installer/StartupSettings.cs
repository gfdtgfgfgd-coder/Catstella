using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static partial class StartupSettings {
#if WIDGET
 public const string Kind="Widget", Title="星语桌宠挂件", AppExe="StarWidget.exe";
#elif SUITE
 public const string Kind="Suite", Title="星语套件", AppExe="StarSuite.exe";
#else
 public const string Kind="Skin", Title="织梦壁纸皮肤", AppExe="DreamSkin.exe";
#endif
 public static string Root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
 const string RunKey="Software\\Microsoft\\Windows\\CurrentVersion\\Run";
 static string SettingsKey="Software\\AntigravityStarSuite\\"+Kind;
 static string RunName="AntigravityStarSuite"+Kind;
 public static string Quote(string value){return "\""+value.Replace("\"", "")+"\"";}
 public static bool Flag(string key){using(var r=Registry.CurrentUser.OpenSubKey(SettingsKey))return r!=null&&(int)r.GetValue(key,0)==1;}
 static bool CurrentInstall(){using(var r=Registry.CurrentUser.OpenSubKey(SettingsKey))return r!=null&&String.Equals((string)r.GetValue("InstallPath",""),Root,StringComparison.OrdinalIgnoreCase);}
 public static void SetFlags(bool auto,bool linked){SetFlags(auto,linked,Flag("EnableBYOK"));}
 public static void SetFlags(bool auto,bool linked,bool byok){
  using(var r=Registry.CurrentUser.CreateSubKey(SettingsKey)){
   r.SetValue("AutoStart",auto?1:0);
   r.SetValue("HostLink",linked?1:0);
   r.SetValue("EnableBYOK",byok?1:0);
   r.SetValue("InstallPath",Root);
  }
  if(Directory.Exists(Root)){
   string byokMarker=Path.Combine(Root,".byok-enabled");
   try{
    if(byok)File.WriteAllText(byokMarker,"1\n");
    else if(File.Exists(byokMarker))File.Delete(byokMarker);
   }catch{}
  }
  using(var r=Registry.CurrentUser.CreateSubKey(RunKey)){
   if(auto||linked)r.SetValue(RunName,Quote(Path.Combine(Root,"StartupSettings.exe"))+" --watch");else r.DeleteValue(RunName,false);
  }
 }
 public static void StartGatewayFirst(){
  if(!Flag("EnableBYOK"))return;
  string exe=Path.Combine(Root,AppExe);
  string daemon=Path.Combine(Root,"resources","app","shared","gateway","daemon.cjs");
  if(!File.Exists(exe)||!File.Exists(daemon))return;
  try{
   var psi=new ProcessStartInfo(exe,Quote(daemon)){
    UseShellExecute=false,
    CreateNoWindow=true,
    WorkingDirectory=Root,
    RedirectStandardOutput=true
   };
   psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"]="1";
   var proc=Process.Start(psi);
   if(proc!=null){
    var readTask=proc.StandardOutput.ReadLineAsync();
    readTask.Wait(150);
   }
  }catch{}
 }
 public static void StopGatewayDaemon(){
  string exe=Path.Combine(Root,AppExe);
  string daemon=Path.Combine(Root,"resources","app","shared","gateway","daemon.cjs");
  if(!File.Exists(exe)||!File.Exists(daemon))return;
  try{
   var psi=new ProcessStartInfo(exe,Quote(daemon)+" --stop"){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root};
   psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"]="1";
   using(var p=Process.Start(psi))if(p!=null)p.WaitForExit(2000);
  }catch{}
 }
 public static void StartApp(bool background){
  // Highest Startup Priority: ensure BYOK gateway binds (<150ms) BEFORE UI & skin injection
  if(Flag("EnableBYOK"))StartGatewayFirst();
  string args=(background?"--background":"")+(Kind=="Skin"&&background?" --enable":"")+(Flag("EnableBYOK")?" --enable-byok":"");
  var p=new ProcessStartInfo(Path.Combine(Root,AppExe),args.Trim()){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root};
  p.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");Process.Start(p);
 }
 public static bool ShouldLaunch(bool auto,bool linked,bool first,bool host,bool previous){return (auto&&first)||(linked&&host&&!previous);}
 static bool HostRunning(){var all=Process.GetProcessesByName("Antigravity");try{foreach(var p in all)try{if(p.SessionId==Process.GetCurrentProcess().SessionId)return true;}catch{}return false;}finally{foreach(var p in all)p.Dispose();}}
 static void Watch(){
  bool created;using(var mutex=new Mutex(true,"Local\\StarSuiteStartup"+Kind,out created)){
   if(!created){try{if(!mutex.WaitOne(5000))return;}catch(AbandonedMutexException){}}
   bool first=true,previous=false;
   while(File.Exists(Path.Combine(Root,".starsuite-install"))){
    if(!CurrentInstall())return;
    bool auto=Flag("AutoStart"),linked=Flag("HostLink");if(!auto&&!linked)return;
    bool host=linked&&HostRunning();if(ShouldLaunch(auto,linked,first,host,previous))try{StartApp(true);}catch{}
    if(!linked)return;first=false;previous=host;Thread.Sleep(2000);
   }
  }
 }
 public static void CreateShortcut(string file,string target,string arguments,string icon=""){
  Directory.CreateDirectory(Path.GetDirectoryName(file));Type t=Type.GetTypeFromProgID("WScript.Shell");dynamic shell=Activator.CreateInstance(t);dynamic lnk=shell.CreateShortcut(file);lnk.TargetPath=target;lnk.Arguments=arguments;lnk.WorkingDirectory=Root;lnk.IconLocation=icon.Length>0?icon+",0":Path.Combine(Root,AppExe)+",0";lnk.Save();
 }
 static string Programs {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Antigravity Star Suite",Title);}}
 public static void Shortcuts(bool create){
  string exe=Path.Combine(Root,AppExe),manager=Path.Combine(Root,"StartupSettings.exe");
  if(Kind=="Suite"){
   // 统一套件：开始菜单只保留 启动 / 设置 / 卸载 三项，图标分别取猫娘 默认 / 得意 / 委屈 表情。
   string icons=Path.Combine(Root,"icons");
   string launchIcon=Path.Combine(icons,"launch.ico"),settingsIcon=Path.Combine(icons,"settings.ico"),uninstallIcon=Path.Combine(icons,"uninstall.ico");
   string[] paths={Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Title+".lnk"),Path.Combine(Programs,"启动.lnk"),Path.Combine(Programs,"设置.lnk"),Path.Combine(Programs,"卸载.lnk")};
   if(create){
    CreateShortcut(paths[0],exe,"",launchIcon);
    CreateShortcut(paths[1],exe,"",launchIcon);
    CreateShortcut(paths[2],exe,"--settings",settingsIcon);
    CreateShortcut(paths[3],manager,"--uninstall",uninstallIcon);
   }else foreach(var file in paths)if(File.Exists(file))try{dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic lnk=shell.CreateShortcut(file);if(String.Equals((string)lnk.TargetPath,exe,StringComparison.OrdinalIgnoreCase)||String.Equals((string)lnk.TargetPath,manager,StringComparison.OrdinalIgnoreCase))File.Delete(file);}catch{}
   return;
  }
  string[] legacyPaths={Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Title+".lnk"),Path.Combine(Programs,Title+".lnk"),Path.Combine(Programs,"启动设置.lnk"),Path.Combine(Programs,"卸载.lnk")};
  if(create){CreateShortcut(legacyPaths[0],exe,"");CreateShortcut(legacyPaths[1],exe,"");CreateShortcut(legacyPaths[2],manager,"");CreateShortcut(legacyPaths[3],manager,"--uninstall");}
  else foreach(var file in legacyPaths)if(File.Exists(file))try{dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic lnk=shell.CreateShortcut(file);if(String.Equals((string)lnk.TargetPath,exe,StringComparison.OrdinalIgnoreCase)||String.Equals((string)lnk.TargetPath,manager,StringComparison.OrdinalIgnoreCase))File.Delete(file);}catch{}
 }
 public static string UninstallKey {get{return "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AntigravityStarSuite"+Kind;}}
 static void Uninstall(){
  if(!File.Exists(Path.Combine(Root,".starsuite-install")))throw new Exception("安装标记不存在，无法卸载此目录。");
  if(MessageBox.Show("卸载"+Title+"？将保留你的角色设置和用量记录。","卸载",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;
  StopGatewayDaemon();
  SetFlags(false,false,false);Shortcuts(false);
  using(var p=Process.Start(new ProcessStartInfo(Path.Combine(Root,AppExe),"--quit"){UseShellExecute=false,CreateNoWindow=true}))p.WaitForExit(5000);
  Registry.CurrentUser.DeleteSubKeyTree(UninstallKey,false);
  string temp=Path.Combine(Path.GetTempPath(),"StarSuite-Uninstall-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
  string worker=Path.Combine(temp,"StartupSettings.exe");File.Copy(Application.ExecutablePath,worker);
  Process.Start(new ProcessStartInfo(worker,"--remove-root "+Quote(Root)){UseShellExecute=false,CreateNoWindow=true});
 }
 static void RemoveRoot(string root){
  root=Path.GetFullPath(root);string marker=Path.Combine(root,".starsuite-install");
  if(!File.Exists(marker)||File.ReadAllText(marker).Trim()!=Kind||root.Length<12||Path.GetPathRoot(root)==root||String.Equals(root,Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),StringComparison.OrdinalIgnoreCase))throw new Exception("安装目录校验失败");
  Thread.Sleep(3000);for(int i=0;i<10;i++)try{Directory.Delete(root,true);return;}catch{Thread.Sleep(1000);}
  MessageBox.Show("部分文件正在使用，请退出插件后删除："+root);
 }
 [STAThread] public static void Main(string[] args){
  Application.EnableVisualStyles();try{
   if(args.Length>1&&args[0]=="--remove-root"){RemoveRoot(args[1]);return;}
   if(args.Length>0&&args[0]=="--self-test"){
    if(!ShouldLaunch(true,false,true,false,false)||ShouldLaunch(false,true,false,true,true)||!ShouldLaunch(false,true,false,true,false)||ShouldLaunch(false,false,true,true,false))Environment.Exit(1);
    SettingsKey+="\\Verification-"+Guid.NewGuid().ToString("N");RunName+="Verification"+Guid.NewGuid().ToString("N");
    string previousRoot=Root;
    string tempRoot=Path.Combine(Path.GetTempPath(),"StarSuite-SelfTest-"+Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(tempRoot);
    Root=tempRoot;
    try{
     SetFlags(true,false,false);if(!Flag("AutoStart")||Flag("HostLink")||Flag("EnableBYOK"))throw new Exception("Autostart test failed");
     if(File.Exists(Path.Combine(tempRoot,".byok-enabled")))throw new Exception("BYOK opt-out must not write marker");
     SetFlags(false,true,true);if(Flag("AutoStart")||!Flag("HostLink")||!Flag("EnableBYOK"))throw new Exception("Host link + BYOK test failed");
     if(!File.Exists(Path.Combine(tempRoot,".byok-enabled")))throw new Exception("BYOK opt-in marker missing");
     SetFlags(false,false,true);using(var r=Registry.CurrentUser.OpenSubKey(RunKey))if(r.GetValue(RunName)!=null)throw new Exception("BYOK alone must not register Run autostart");
     SetFlags(false,false,false);using(var r=Registry.CurrentUser.OpenSubKey(RunKey))if(r.GetValue(RunName)!=null)throw new Exception("Run cleanup failed");
     if(File.Exists(Path.Combine(tempRoot,".byok-enabled")))throw new Exception("BYOK marker cleanup failed");
    }finally{
     Root=previousRoot;
     try{Directory.Delete(tempRoot,true);}catch{}
     using(var r=Registry.CurrentUser.CreateSubKey(RunKey))r.DeleteValue(RunName,false);
     Registry.CurrentUser.DeleteSubKeyTree(SettingsKey,false);
    }
    return;
   }
   if(args.Length>0&&args[0]=="--watch"){Watch();return;}
   if(args.Length>0&&args[0]=="--uninstall"){Uninstall();return;}
   var form=new Form{Text=Title+" · 启动设置",Width=560,Height=315,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false};
   var auto=new CheckBox{Text="开机登录后自动启动",Left=24,Top=24,Width=500,Checked=Flag("AutoStart")};
   var link=new CheckBox{Text="打开 Antigravity 时联动启动（后台检测）",Left=24,Top=60,Width=500,Checked=Flag("HostLink")};
   var byok=new CheckBox{Text="启用第三方模型网关 (BYOK / 支持自定义 API Key 与模型代理)",Left=24,Top=96,Width=510,Checked=Flag("EnableBYOK")};
   var note=new Label{Text="可独立开关。启用 BYOK 时网关具有最高启动优先级，先于 UI 完成握手。\n未勾选时不占用任何端口、不干扰已有代理；不修改宿主安装文件。",Left=24,Top=136,Width=505,Height=55};
   var save=new Button{Text="保存设置",Left=380,Top=214,Width=130};save.Click+=(s,e)=>{bool wasByok=Flag("EnableBYOK");SetFlags(auto.Checked,link.Checked,byok.Checked);if(wasByok&&!byok.Checked)StopGatewayDaemon();if(auto.Checked||link.Checked)Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--watch"){UseShellExecute=false,CreateNoWindow=true});MessageBox.Show("启动设置已保存。");form.Close();};
   form.Controls.AddRange(new Control[]{auto,link,byok,note,save});Application.Run(form);
  }catch(Exception e){MessageBox.Show(e.Message,Title);Environment.ExitCode=1;}
 }
}
