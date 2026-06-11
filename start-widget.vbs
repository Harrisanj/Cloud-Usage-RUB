Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = scriptDir
sh.Run """" & scriptDir & "\node_modules\electron\dist\electron.exe"" .", 0, False
