; Inno Setup script for Restaurant POS.
;
; Two decisions worth understanding before changing anything here:
;
; 1. PrivilegesRequired=lowest. The program installs per user, into
;    %LOCALAPPDATA%\Programs, and never asks for an administrator. A restaurant
;    till is often used by staff on a standard Windows account, and an installer
;    that demands admin is an installer that does not get run.
;
; 2. The database lives in %ProgramData%\RestaurantPOS, NOT in the program
;    folder, and the uninstaller does not touch it by default. Deleting a
;    restaurant's sales history because somebody reinstalled the program would
;    be unforgivable.
;
; Build:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\pos.iss

#define AppName      "Restaurant POS"
#define AppNameAr    "نظام كاشير المطاعم"
#define AppVersion   "1.0.0"
#define AppPublisher "Yaya El Khouli"
#define AppExe       "RestaurantPOS.exe"

; Set on the ISCC command line: /DPayloadDir=... /DOutputDir=...
#ifndef PayloadDir
  #define PayloadDir "..\..\dist\payload"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif

[Setup]
; Never change AppId: it is how Windows recognises an upgrade rather than a
; second, parallel installation.
AppId={{7C4B1E92-3F5A-4D68-9C21-8A6E5D0F1B33}
AppName={#AppNameAr}
AppVersion={#AppVersion}
AppVerName={#AppNameAr} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppNameAr}
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=RestaurantPOS-Setup-{#AppVersion}
SetupIconFile=pos.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppNameAr}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; The payload is ~130 MB of PostgreSQL; refuse to start on a full disk.
DiskSpanning=no
LicenseFile={#PayloadDir}\LICENSE
CloseApplications=yes
CloseApplicationsFilter=*.exe
RestartApplications=no

[Languages]
Name: "ar"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "إنشاء أيقونة على سطح المكتب"; GroupDescription: "اختصارات:"
Name: "startupicon"; Description: "تشغيل البرنامج تلقائياً عند فتح الجهاز"; GroupDescription: "اختصارات:"; Flags: unchecked

[Files]
; The whole payload tree: RestaurantPOS.exe, web\, pgsql\, database\init\.
; recursesubdirs pulls in everything beneath it.
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; The WebView2 bootstrapper. Windows 11 always has the runtime; an old Windows 10
; may not, and without it the program has no window. ~2 MB, run only when needed.
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WebView2Missing

[Icons]
Name: "{group}\{#AppNameAr}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppNameAr}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"; Tasks: desktopicon
Name: "{userstartup}\{#AppNameAr}"; Filename: "{app}\{#AppExe}"; Tasks: startupicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "تثبيت مكوّن العرض المطلوب..."; Check: WebView2Missing; Flags: waituntilterminated
Filename: "{app}\{#AppExe}"; Description: "تشغيل {#AppNameAr} الآن"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; The WebView2 browser profile is a cache, not data. Everything else under
; RestaurantPOS -- pgdata, backups, jwt.key -- is the restaurant's, and stays.
Type: filesandordirs; Name: "{commonappdata}\RestaurantPOS\webview"

[Code]
// WebView2Missing decides whether the bootstrapper needs to run at all.
// Presence is recorded under EdgeUpdate\Clients\{GUID} with a non-empty "pv".
function WebView2Missing: Boolean;
var
  pv: String;
begin
  Result := True;
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
       'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', pv) then
    if (pv <> '') and (pv <> '0.0.0.0') then
      Result := False;
  if Result then
    if RegQueryStringValue(HKEY_CURRENT_USER,
         'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', pv) then
      if (pv <> '') and (pv <> '0.0.0.0') then
        Result := False;
end;

// On uninstall, ask once before destroying the restaurant's data. Default is No.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{commonappdata}\RestaurantPOS');
    if DirExists(DataDir) then
    begin
      if MsgBox('هل تريد حذف بيانات المطعم أيضاً؟' + #13#10#13#10 +
                'هذا يشمل كل الطلبات والمبيعات والورديات والنسخ الاحتياطية.' + #13#10 +
                'لا يمكن التراجع عن هذا.' + #13#10#13#10 +
                'اختر «لا» للاحتفاظ بها.',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataDir, True, True, True)
      else
        MsgBox('تم الاحتفاظ ببياناتك في:' + #13#10 + DataDir, mbInformation, MB_OK);
    end;
  end;
end;
