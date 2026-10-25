@echo off
cd /d "%~dp0"
set "RACK_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "RACK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Install Node.js and pnpm, then run pnpm install.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Build is missing. Run pnpm build first.
  pause
  exit /b 1
)
"%RACK_NODE%" node_modules\vite\bin\vite.js preview --host 127.0.0.1 --port 4173 --strictPort --open
pause
