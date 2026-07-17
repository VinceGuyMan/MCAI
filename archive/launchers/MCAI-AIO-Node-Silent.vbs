' Norton-safe: same as MCAI-AIO-Silent.vbs (Node only)
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd.exe /c """ & dir & "\MCAI-AIO.cmd""", 1, False
