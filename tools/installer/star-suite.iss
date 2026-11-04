; 星语套件 Inno Setup 安装脚本 — 由 tools/build-installers.cjs 通过 ISCC 编译。
; 组件：core（桌宠+皮肤，必装）/ webext（Web 插件包与安装指引，可选，档位 1：复制包 + 图文指引）。
#define AppName "Catstella"
#define AppExe "StarSuite.exe"
#define AppId "{{A3F5C7E9-1B2D-4E6F-9A8B-C0D1E2F3A4B5}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Catstella Community
DefaultDirName={localappdata}\Programs\Catstella\Suite
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=Catstella-Setup-{#AppVersion}-x64
SetupIconFile={#StageDir}\resources\app\Antigravity-Cat-Widget\assets\app-icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
CloseApplications=no
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}

[Languages]
Name: "chinese"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "完整安装（桌宠 + 皮肤 + Web 插件引导）"
Name: "compact"; Description: "仅桌面端（桌宠 + 皮肤）"
Name: "custom"; Description: "自定义"

[Components]
Name: "core"; Description: "星语桌宠 + 织梦皮肤（必装核心）"; Types: full compact custom; Flags: fixed
Name: "webext"; Description: "Web 端插件包与安装指引（Firefox / Edge / Chrome）"; Types: full custom

[Tasks]
Name: "autostart"; Description: "开机登录后自动启动星语套件"; Flags: unchecked
Name: "hostlink"; Description: "打开 Antigravity 时联动启动（后台检测）"; Flags: unchecked
Name: "byok"; Description: "启用第三方模型网关 (BYOK / 支持自定义 API Key 与模型代理)"; Flags: unchecked

[Files]
Source:"{#StageDir}\*"; DestDir:"{app}"; Excludes:"daemon.cjs"; Flags: recursesubdirs createallsubdirs ignoreversion; Components: core
Source:"{#StageDir}\resources\app\shared\gateway\daemon.cjs"; DestDir:"{app}\resources\app\shared\gateway"; Components: core; Tasks: byok; Flags: ignoreversion
Source:"{#StageDir}\.starsuite-install"; DestDir:"{app}"; Components: core; Flags: ignoreversion
Source:"{#StageDir}\web-plugin-guide.html"; DestDir:"{app}\web-extension"; Components: webext; Flags: ignoreversion
#ifdef WebExtFiles
Source:"{#WebExtFiles}\kimino-gemini-companion.xpi"; DestDir:"{app}\web-extension"; Components: webext; Flags: ignoreversion
Source:"{#WebExtFiles}\kimino-gemini-companion-edge-chrome.zip"; DestDir:"{app}\web-extension"; Components: webext; Flags: ignoreversion
#endif

[Icons]
Name:"{autodesktop}\{#AppName}"; Filename:"{app}\{#AppExe}"; IconFilename:"{app}\icons\launch.ico"; Components: core
Name:"{autoprograms}\Catstella\{#AppName}\启动"; Filename:"{app}\{#AppExe}"; IconFilename:"{app}\icons\launch.ico"; Components: core
Name:"{autoprograms}\Catstella\{#AppName}\设置"; Filename:"{app}\{#AppExe}"; Parameters:"--settings"; IconFilename:"{app}\icons\settings.ico"; Components: core
Name:"{autoprograms}\Catstella\{#AppName}\卸载"; Filename:"{uninstallexe}"; IconFilename:"{app}\icons\uninstall.ico"; Components: core

[Run]
Filename:"{app}\{#AppExe}"; Description:"立即启动 Catstella"; Flags: postinstall nowait skipifdoesntexist; Check: CoreSelected
Filename:"{app}\web-extension\web-plugin-guide.html"; Description:"查看 Web 插件安装指引"; Flags: postinstall shellexec skipifdoesntexist unchecked; Check: WebExtSelected

[Code]
function CoreSelected(): Boolean;
begin
  Result := WizardIsComponentSelected('core');
end;

function WebExtSelected(): Boolean;
begin
  Result := WizardIsComponentSelected('webext');
end;

// 安装前：优雅退出旧实例（单实例 IPC --quit），并临时清零联动标志让 --watch 守护自退，避免文件占用。
function PrepareToInstall(var NeedsRestart: Boolean): String;
var ResultCode: Integer; appExe: String;
begin
  appExe := ExpandConstant('{app}') + '\StarSuite.exe';
  if FileExists(appExe) then begin
    Exec(appExe, '--quit', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
  RegWriteDWordValue(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite', 'AutoStart', 0);
  RegWriteDWordValue(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite', 'HostLink', 0);
  Sleep(2500);
  // 迁移清理：旧 C# 安装器留下的卸载注册项（Inno 从本版起接管卸载）
  RegDeleteKeyIncludingSubkeys(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\AntigravityStarSuiteSuite');
  Result := '';
end;

// 安装后：按任务勾选写入启动标志与登录项（与 StartupSettings.SetFlags 语义一致）。
procedure CurStepChanged(CurStep: TSetupStep);
var auto, link, byok: Integer; runCmd, markerFile: String;
begin
  if CurStep = ssPostInstall then begin
    auto := 0; link := 0; byok := 0;
    if WizardIsTaskSelected('autostart') then auto := 1;
    if WizardIsTaskSelected('hostlink') then link := 1;
    if WizardIsTaskSelected('byok') then byok := 1;
    RegWriteDWordValue(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite', 'AutoStart', auto);
    RegWriteDWordValue(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite', 'HostLink', link);
    RegWriteDWordValue(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite', 'EnableBYOK', byok);
    RegWriteStringValue(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite', 'InstallPath', ExpandConstant('{app}'));
    markerFile := ExpandConstant('{app}') + '\.byok-enabled';
    if byok = 1 then
      SaveStringToFile(markerFile, '1' + #13#10, False)
    else if FileExists(markerFile) then
      DeleteFile(markerFile);
    runCmd := '"' + ExpandConstant('{app}') + '\StartupSettings.exe" --watch';
    if (auto = 1) or (link = 1) then
      RegWriteStringValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AntigravityStarSuiteSuite', runCmd)
    else
      RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AntigravityStarSuiteSuite');
  end;
end;

// 卸载前：优雅退出运行中的套件（单实例 IPC --quit）并等待进程树退出，绝不 taskkill。
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var ResultCode: Integer; appExe: String; i: Integer;
begin
  if CurUninstallStep = usUninstall then begin
    appExe := ExpandConstant('{app}') + '\StarSuite.exe';
    if FileExists(appExe) then begin
      Exec(appExe, '--quit', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      for i := 1 to 12 do Sleep(1000);
    end;
  end;
  if CurUninstallStep = usPostUninstall then begin
    RegDeleteKeyIncludingSubkeys(HKEY_CURRENT_USER, 'Software\AntigravityStarSuite\Suite');
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AntigravityStarSuiteSuite');
  end;
end;
