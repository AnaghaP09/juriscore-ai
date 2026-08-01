@echo off
rem JurisCore on-prem package - start script (Windows).
rem Runs the bundled server. Every dependency is already inside this folder, so
rem nothing is downloaded and no registry is contacted.
setlocal

where bun >nul 2>nul
if errorlevel 1 (
  echo [juriscore] Bun is required but was not found on your PATH. Install it first:
  echo [juriscore]   Windows       : powershell -c "irm bun.sh/install.ps1 ^| iex"
  echo [juriscore]   macOS / Linux : curl -fsSL https://bun.sh/install ^| bash
  echo [juriscore] Then re-run:  start.cmd
  exit /b 1
)

cd /d "%~dp0"
if "%PORT%"=="" set PORT=8080

echo [juriscore] Starting JurisCore. Open http://localhost:%PORT%/ when the server reports it is listening.
bun run .\server\index.mjs
