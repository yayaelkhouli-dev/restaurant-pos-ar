//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
	"unsafe"

	"github.com/jchv/go-webview2"
)

var (
	kernel32          = syscall.NewLazyDLL("kernel32.dll")
	user32            = syscall.NewLazyDLL("user32.dll")
	procCreateMutexW  = kernel32.NewProc("CreateMutexW")
	procCloseHandle   = kernel32.NewProc("CloseHandle")
	procMessageBoxW   = user32.NewProc("MessageBoxW")
	procFindWindowW   = user32.NewProc("FindWindowW")
	procSetForeground = user32.NewProc("SetForegroundWindow")
	procShowWindow    = user32.NewProc("ShowWindow")
)

const (
	errAlreadyExists = 183

	mbOK          = 0x00000000
	mbIconError   = 0x00000010
	mbIconWarning = 0x00000030
	mbSystemModal = 0x00001000

	swRestore = 9
)

// mutexName is per-machine (the "Global\" prefix is deliberately absent, so a
// second Windows user could in principle run their own copy; the ProgramData
// database would then be contested, which pgboot detects and reports).
const mutexName = "RestaurantPOS_SingleInstance"

// acquireSingleInstance stops a second copy from starting. Two copies would
// fight over the same database directory and the same port, and the loser dies
// with an error the customer cannot interpret.
func acquireSingleInstance() (release func(), err error) {
	name, err := syscall.UTF16PtrFromString(mutexName)
	if err != nil {
		return nil, err
	}
	h, _, callErr := procCreateMutexW.Call(0, 1, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return nil, callErr
	}
	if errno, ok := callErr.(syscall.Errno); ok && errno == errAlreadyExists {
		procCloseHandle.Call(h)
		return nil, errors.New("البرنامج مفتوح بالفعل")
	}
	return func() { procCloseHandle.Call(h) }, nil
}

// focusExistingWindow brings the already-running copy to the front, which is
// what a user who double-clicked the icon twice actually wants.
func focusExistingWindow() {
	title, err := syscall.UTF16PtrFromString(appTitle)
	if err != nil {
		return
	}
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(title)))
	if hwnd == 0 {
		showWarning(appTitle, "البرنامج مفتوح بالفعل.")
		return
	}
	procShowWindow.Call(hwnd, swRestore)
	procSetForeground.Call(hwnd)
}

func messageBox(title, text string, flags uintptr) {
	t, err1 := syscall.UTF16PtrFromString(title)
	b, err2 := syscall.UTF16PtrFromString(text)
	if err1 != nil || err2 != nil {
		return
	}
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(t)), flags)
}

// showError is the only way this program can talk to the user before its window
// exists. Without a console, a fatal error would otherwise be silent.
func showError(title, text string) {
	messageBox(title, text, mbOK|mbIconError|mbSystemModal)
}

func showWarning(title, text string) {
	messageBox(title, text, mbOK|mbIconWarning|mbSystemModal)
}

// openWindow shows the POS in its own window and blocks until it is closed.
//
// WebView2 keeps a browser profile on disk. Its default location is beside the
// executable, which is read-only once the program is installed under Program
// Files -- so the window would simply fail to appear. DataPath moves it next to
// the database, where we know we can write.
func openWindow(title, url, profileDir string) error {
	if err := os.MkdirAll(profileDir, 0o755); err != nil {
		return err
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  profileDir,
		WindowOptions: webview2.WindowOptions{
			Title:  title,
			Width:  1400,
			Height: 900,
			Center: true,
		},
	})
	if w == nil {
		// The WebView2 runtime is missing. Windows 11 always has it; a stale
		// Windows 10 may not.
		return errors.New("WebView2 runtime is not installed")
	}
	defer w.Destroy()

	w.Navigate(url)
	w.Run()
	return nil
}

// browserFallback keeps the customer working when the window engine is absent:
// the POS is a web app, so any browser will do.
func browserFallback(url string, cause error) {
	showWarning(appTitle,
		"تعذّر فتح نافذة البرنامج، فسيُفتح في المتصفح بدلاً منها.\r\n\r\n"+
			"السبب: "+cause.Error()+"\r\n\r\n"+
			"أغلق نافذة المتصفح ثم أغلق هذه الرسالة لإنهاء البرنامج.")
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	messageBox(appTitle, "البرنامج يعمل الآن على:\r\n"+url+"\r\n\r\nاضغط «موافق» لإغلاق البرنامج.", mbOK|mbSystemModal)
}
