@echo off
rem ============================================================
rem  HMCS installer (Hallo Minecraft Space)
rem  Run this file from the folder that contains HMCS.exe.
rem  It copies the app to %LOCALAPPDATA%\Programs\HMCS,
rem  creates Start Menu / Desktop shortcuts, registers the
rem  uninstall entry and finally launches HMCS.
rem ============================================================
setlocal EnableDelayedExpansion

set "SRC=%~dp0"
set "SRC=%SRC:~0,-1%"
set "TARGET=%LOCALAPPDATA%\Programs\HMCS"
set "APPDIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "DESK=%USERPROFILE%\Desktop"
set "KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\HMCS"
set "EXE=HMCS.exe"

if not exist "%SRC%\%EXE%" (
  echo [HMCS] ERROR: %EXE% not found next to this script.
  echo [HMCS] Please unzip the whole archive first, then run install.cmd again.
  pause
  exit /b 1
)

echo [HMCS] Installing to %TARGET% ...
if not exist "%TARGET%" mkdir "%TARGET%" >nul 2>&1
xcopy /Y /E /Q /I "%SRC%\*" "%TARGET%" >nul
if errorlevel 1 (
  echo [HMCS] ERROR: copy failed.
  pause
  exit /b 1
)

rem --- shortcuts (PowerShell WScript.Shell) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w=New-Object -ComObject WScript.Shell; ^
   $s=$w.CreateShortcut('%APPDIR%\HMCS.lnk'); ^
   $s.TargetPath='%TARGET%\%EXE%'; $s.WorkingDirectory='%TARGET%'; ^
   $s.Description='Hallo Minecraft Space'; $s.IconLocation='%TARGET%\%EXE%,0'; $s.Save(); ^
   $d=$w.CreateShortcut('%DESK%\HMCS.lnk'); ^
   $d.TargetPath='%TARGET%\%EXE%'; $d.WorkingDirectory='%TARGET%'; ^
   $d.Description='Hallo Minecraft Space'; $d.IconLocation='%TARGET%\%EXE%,0'; $d.Save()" >nul 2>&1

rem --- uninstall registry entry ---
reg add "%KEY%" /v DisplayName /t REG_SZ /d "HMCS - Hallo Minecraft Space" /f >nul 2>&1
reg add "%KEY%" /v DisplayVersion /t REG_SZ /d "0.1.0" /f >nul 2>&1
reg add "%KEY%" /v Publisher /t REG_SZ /d "HMCS" /f >nul 2>&1
reg add "%KEY%" /v InstallLocation /t REG_SZ /d "%TARGET%" /f >nul 2>&1
reg add "%KEY%" /v UninstallString /t REG_SZ /d "\"%TARGET%\Uninstall.cmd\"" /f >nul 2>&1
reg add "%KEY%" /v NoModify /t REG_DWORD /d 1 /f >nul 2>&1
reg add "%KEY%" /v NoRepair /t REG_DWORD /d 1 /f >nul 2>&1

rem --- uninstall script ---
> "%TARGET%\Uninstall.cmd" echo @echo off
>>"%TARGET%\Uninstall.cmd" echo set "T=%%LOCALAPPDATA%%\Programs\HMCS"
>>"%TARGET%\Uninstall.cmd" echo taskkill /IM %EXE% /F ^>nul 2>&1
>>"%TARGET%\Uninstall.cmd" echo rmdir /S /Q "%%T%%" ^>nul 2>&1
>>"%TARGET%\Uninstall.cmd" echo del /F /Q "%%~f0" ^>nul 2>&1
>>"%TARGET%\Uninstall.cmd" echo reg delete "%KEY%" /f ^>nul 2>&1
>>"%TARGET%\Uninstall.cmd" echo del /F /Q "%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\HMCS.lnk" ^>nul 2>&1
>>"%TARGET%\Uninstall.cmd" echo echo [HMCS] Uninstalled.

echo [HMCS] Done. Shortcuts created (Start Menu + Desktop).
echo [HMCS] Launching HMCS ...
start "" "%TARGET%\%EXE%"
exit /b 0
