@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado no PATH. Consulte o README desta pasta.
  pause
  exit /b 2
)
node.exe "%~dp0test\electron-medium-launcher.cjs"
set "COMPANION_EXIT=%ERRORLEVEL%"
echo.
echo Codigo do teste: %COMPANION_EXIT%. Consulte a pasta diagnostics indicada acima.
pause
exit /b %COMPANION_EXIT%
