using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class StartupSettings {
#if WIDGET
 public const string Kind="Widget", Title="星语桌宠挂件", AppExe="StarWidget.exe";
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
 public static void SetFlags(bool auto,bool linked){
  using(var r=Registry.CurrentUser.CreateSubKey(SettingsKey)){r.SetValue("AutoStart",auto?1:0);r.SetValue("HostLink",linked?1:0);r.SetValue("InstallPath",Root);}
  using(var r=Registry.CurrentUser.CreateSubKey(RunKey)){
   if(auto||linked)r.SetValue(RunName,Quote(Path.Combine(Root,"StartupSettings.exe"))+" --watch");else r.DeleteValue(RunName,false);
  }
 }
 public static void StartApp(bool background){
  var p=new ProcessStartInfo(Path.Combine(Root,AppExe),(background?"--background":"")+(Kind=="Skin"&&background?" --enable":"")){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root};
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
 public static void CreateShortcut(string file,string target,string arguments){
  Directory.CreateDirectory(Path.GetDirectoryName(file));Type t=Type.GetTypeFromProgID("WScript.Shell");dynamic shell=Activator.CreateInstance(t);dynamic lnk=shell.CreateShortcut(file);lnk.TargetPath=target;lnk.Arguments=arguments;lnk.WorkingDirectory=Root;lnk.IconLocation=Path.Combine(Root,AppExe)+",0";lnk.Save();
 }
 static string Programs {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Antigravity Star Suite",Title);}}
 public static void Shortcuts(bool create){
  string exe=Path.Combine(Root,AppExe),manager=Path.Combine(Root,"StartupSettings.exe");
  string[] paths={Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Title+".lnk"),Path.Combine(Programs,Title+".lnk"),Path.Combine(Programs,"启动设置.lnk"),Path.Combine(Programs,"卸载.lnk")};
  if(create){CreateShortcut(paths[0],exe,"");CreateShortcut(paths[1],exe,"");CreateShortcut(paths[2],manager,"");CreateShortcut(paths[3],manager,"--uninstall");}
  else foreach(var file in paths)if(File.Exists(file))try{dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic lnk=shell.CreateShortcut(file);if(String.Equals((string)lnk.TargetPath,exe,StringComparison.OrdinalIgnoreCase)||String.Equals((string)lnk.TargetPath,manager,StringComparison.OrdinalIgnoreCase))File.Delete(file);}catch{}
 }
 public static string UninstallKey {get{return "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AntigravityStarSuite"+Kind;}}
 static void Uninstall(){
  if(!File.Exists(Path.Combine(Root,".starsuite-install")))throw new Exception("安装标记不存在，无法卸载此目录。");
  if(MessageBox.Show("卸载"+Title+"？将保留你的角色设置和用量记录。","卸载",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;
  SetFlags(false,false);Shortcuts(false);
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
    try{
     SetFlags(true,false);if(!Flag("AutoStart")||Flag("HostLink"))throw new Exception("Autostart test failed");
     SetFlags(false,true);if(Flag("AutoStart")||!Flag("HostLink"))throw new Exception("Host link test failed");
     SetFlags(false,false);using(var r=Registry.CurrentUser.OpenSubKey(RunKey))if(r.GetValue(RunName)!=null)throw new Exception("Run cleanup failed");
     string testLink=Path.Combine(Path.GetTempPath(),"StarSuite-verify-"+Guid.NewGuid().ToString("N")+".lnk");
     try{CreateShortcut(testLink,Path.Combine(Root,AppExe),"--background");dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic shortcut=shell.CreateShortcut(testLink);if(!String.Equals((string)shortcut.TargetPath,Path.Combine(Root,AppExe),StringComparison.OrdinalIgnoreCase)||(string)shortcut.Arguments!="--background")throw new Exception("Shortcut test failed");}finally{if(File.Exists(testLink))File.Delete(testLink);}
    }finally{using(var r=Registry.CurrentUser.CreateSubKey(RunKey))r.DeleteValue(RunName,false);Registry.CurrentUser.DeleteSubKeyTree(SettingsKey,false);}
    return;
   }
   if(args.Length>0&&args[0]=="--watch"){Watch();return;}
   if(args.Length>0&&args[0]=="--uninstall"){Uninstall();return;}
   var form=new Form{Text=Title+" · 启动设置",Width=540,Height=270,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false};
   var auto=new CheckBox{Text="开机登录后自动启动",Left=24,Top=26,Width=460,Checked=Flag("AutoStart")};
   var link=new CheckBox{Text="打开 Antigravity 时联动启动（后台检测）",Left=24,Top=66,Width=470,Checked=Flag("HostLink")};
   var note=new Label{Text="可独立开关。联动会在登录后后台检测宿主进程，约 2 秒响应。\n不修改宿主文件、快捷方式或安装路径；只对当前用户生效。",Left=24,Top=106,Width=475,Height=55};
   var save=new Button{Text="保存设置",Left=360,Top=174,Width=130};save.Click+=(s,e)=>{SetFlags(auto.Checked,link.Checked);if(auto.Checked||link.Checked)Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--watch"){UseShellExecute=false,CreateNoWindow=true});MessageBox.Show("启动设置已保存。");form.Close();};
   form.Controls.AddRange(new Control[]{auto,link,note,save});Application.Run(form);
  }catch(Exception e){MessageBox.Show(e.Message,Title);Environment.ExitCode=1;}
 }
}
