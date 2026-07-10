//go:build !windows

package pgboot

import "os/exec"

func hideWindow(cmd *exec.Cmd) *exec.Cmd { return cmd }
