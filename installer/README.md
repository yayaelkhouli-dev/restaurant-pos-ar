# Installer

Builds `RestaurantPOS-Setup-<version>.exe`, the single file a restaurant runs.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\make-installer.ps1
```

## One file is not in this repository

`MicrosoftEdgeWebview2Setup.exe` — the ~1.6 MB WebView2 bootstrapper, signed by
Microsoft. It is excluded because the repository ignores `*.exe`, and because
Microsoft revises it. Download it here before the first build:

<https://go.microsoft.com/fwlink/p/?LinkId=2124703>

Save it as `installer/MicrosoftEdgeWebview2Setup.exe`. The build script refuses
to run without it and prints the same link.

The installer runs it **only when the WebView2 runtime is missing**. Windows 11
always ships it; an old Windows 10 may not, and without it the program has no
window and falls back to opening a browser.

## What the build needs on this machine

| Tool | Why |
| --- | --- |
| Go 1.21+ | compiles `RestaurantPOS.exe` |
| Node.js | builds the web UI |
| Inno Setup 6 | compiles the installer |
| Visual C++ Build Tools | *not* to compile anything — only as a source for the redistributable DLLs listed below |
| `..\..\pgsql` | the portable PostgreSQL that gets bundled |

None of these ever reach a customer.

## Why the C++ runtime DLLs are copied in

PostgreSQL for Windows is built with MSVC and imports `vcruntime140.dll` and
friends. Those arrive with the Visual C++ Redistributable, which a **clean
Windows does not have**. Without them `postgres.exe` will not start and the
program looks broken for a reason that has nothing to do with it. The build
copies seven DLLs from `VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT` into
`pgsql\bin`, which Microsoft's redistribution terms allow.

## Where things land on the customer's machine

| Path | Contents | On uninstall |
| --- | --- | --- |
| `%LOCALAPPDATA%\Programs\Restaurant POS` | the program | removed |
| `%ProgramData%\RestaurantPOS` | database, backups, signing key | **kept** (asked once, defaults to keeping) |

The install is per-user and never prompts for an administrator.

## Regenerating the icon resource

`cmd/pos-desktop/rsrc_windows_amd64.syso` carries the icon and the manifest into
the binary. It is committed so a plain `go build` produces a proper executable.
Rebuild it after editing `pos.ico` or `pos.manifest`:

```powershell
go run github.com/akavel/rsrc@latest -ico installer\pos.ico -manifest installer\pos.manifest -arch amd64 -o backend\cmd\pos-desktop\rsrc_windows_amd64.syso
```
