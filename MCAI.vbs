' MCAI silent start — no extra console flash before the AIO window.
' Norton-safe: uses cmd + Node only (never powershell.exe).
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd.exe /c """ & dir & "\MCAI.cmd""", 1, False
