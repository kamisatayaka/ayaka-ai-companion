@echo off
setlocal
title Ayaka AI Companion - One-Click Launcher
cd /d "%~dp0"

echo ==========================================
echo   Ayaka AI Companion - One-Click Launcher
echo ==========================================
echo.

rem ---------- 1. Voice clone server (GPT-SoVITS) ----------
set CLONE_ON=0
if exist "voice-clone\venv\Scripts\python.exe" findstr /C:"CLONE_TTS_URL=http" ".env" >nul 2>nul && set CLONE_ON=1
if "%CLONE_ON%"=="1" goto server_needed
goto skip_server

:server_needed
echo [1/4] Checking voice clone server...
netstat -ano | findstr ":9880" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo       Server already running.
    goto skip_server
)
echo       Starting GPT-SoVITS API server...
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
start "GPT-SoVITS API" cmd /k "cd /d %~dp0voice-clone\GPT-SoVITS && ..\venv\Scripts\python.exe api_v2.py"
echo       Waiting for server on port 9880 (up to 2 min)...
set /a tries=0
:wait_server
timeout /t 5 /nobreak >nul
netstat -ano | findstr ":9880" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto server_ok
set /a tries+=1
if %tries% lss 24 goto wait_server
echo       [WARN] Server did not start in time - app will use Edge TTS fallback.
goto skip_server
:server_ok
echo       Server is ready.
:skip_server

rem ---------- 2. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Please install it from https://nodejs.org and run this file again.
    echo.
    pause
    exit /b 1
)

rem ---------- 3. Check and install dependencies ----------
if exist "node_modules\electron\dist\electron.exe" (
    echo [2/4] Dependencies ready.
    goto after_install
)

:install_deps
echo [2/4] First run: installing dependencies (needs network)...
call npm install
if errorlevel 1 (
    echo Install failed, retrying with a China mirror...
    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    call npm install
)
if errorlevel 1 (
    echo.
    echo [ERROR] Dependency install failed. Check your network and try again.
    pause
    exit /b 1
)

:after_install

rem ---------- 4. Build the UI ----------
echo [3/4] Building UI...
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Please share the error above with your dev assistant.
    pause
    exit /b 1
)

rem ---------- 5. Start the app ----------
echo [4/4] Starting Ayaka...
echo.
call npm start

echo.
echo Ayaka has exited. Close the "GPT-SoVITS API" window when done.
pause
