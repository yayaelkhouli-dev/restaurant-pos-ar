//go:build windows

package pgboot

import (
	"os/exec"
	"syscall"
)

// hideWindow stops each pg_ctl / psql child from flashing a black console
// window over the cashier's screen. Every launch runs several of them.
func hideWindow(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}
