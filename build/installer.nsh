!macro customInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\provision.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Sabawoon database provisioning failed. See %ProgramData%\\Sabawoon Educational Academy\\Logs\\install.log."
    Abort
  ${EndIf}
!macroend
