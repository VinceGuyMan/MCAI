' Norton-safe: launch Node AIO via cmd, NEVER powershell.exe
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' /k keeps window open if node crashes; use /c for auto-close after exit
sh.Run "cmd.exe /c """ & dir & "\MCAI-AIO.cmd""", 1, False
