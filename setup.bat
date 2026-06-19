@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Business Registration Extractor - Setup

set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

cls
echo ====================================================================
echo  Business Registration Extractor - Setup
echo ====================================================================
echo.
echo This script prepares the local app:
echo   1. Checks Node.js and npm
echo   2. Creates .env from .env.example when needed
echo   3. Installs dependencies
echo   4. Cleans old build output
echo   5. Builds the app
echo.

set "NODE_CMD=node"
set "NPM_CMD=npm"
set "NPM_MODE=cmd"

echo [STEP 1] Checking Node.js environment...

if exist "%~dp0node\node.exe" (
    echo [OK] Portable Node.js found.
    set "PATH=%~dp0node;%~dp0node\node_modules\npm\bin;%PATH%"
    set "NODE_CMD=%~dp0node\node.exe"

    if exist "%~dp0node\npm.cmd" (
        set "NPM_CMD=%~dp0node\npm.cmd"
        set "NPM_MODE=cmd"
        goto VERIFY_NODE
    )

    if exist "%~dp0node\node_modules\npm\bin\npm-cli.js" (
        set "NPM_CMD=%~dp0node\node_modules\npm\bin\npm-cli.js"
        set "NPM_MODE=js"
        goto VERIFY_NODE
    )

    echo.
    echo [ERROR] npm was not found in the portable Node.js folder.
    echo Expected:
    echo   %~dp0node\npm.cmd
    echo or:
    echo   %~dp0node\node_modules\npm\bin\npm-cli.js
    goto FAIL
)

where node >nul 2>&1
if not errorlevel 1 (
    echo [OK] Global Node.js found.
    set "NODE_CMD=node"
    set "NPM_CMD=npm"
    set "NPM_MODE=cmd"
    goto VERIFY_NODE
)

echo.
echo [ERROR] Node.js is not installed.
echo Install Node.js LTS or place portable Node.js in this folder:
echo   node\node.exe
echo   node\npm.cmd
goto FAIL

:VERIFY_NODE
echo.
echo [STEP 1-1] Verifying node and npm...

"%NODE_CMD%" -v
if errorlevel 1 (
    echo [ERROR] node version check failed.
    goto FAIL
)

if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" -v
) else (
    call "%NODE_CMD%" "%NPM_CMD%" -v
)
if errorlevel 1 (
    echo [ERROR] npm version check failed.
    goto FAIL
)

for /f "delims=" %%V in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%V"
if "!NODE_MAJOR!"=="" (
    echo [ERROR] Could not read Node.js major version.
    goto FAIL
)

if !NODE_MAJOR! LSS 18 (
    echo [ERROR] Node.js 18 or newer is required.
    goto FAIL
)

echo [OK] Node.js and npm are ready.

echo.
echo [STEP 2] Checking project files...

if not exist "package.json" (
    echo [ERROR] package.json was not found.
    echo Run this file from the project root folder.
    goto FAIL
)

echo [OK] package.json found.

echo.
echo [STEP 3] Preparing .env...

if exist ".env" (
    echo [OK] Existing .env found. It will not be overwritten.
) else (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [OK] Created .env from .env.example.
    ) else (
        (
        echo # Local environment
        echo APP_URL=http://localhost:3000
        echo KAKAO_REST_API_KEY=PUT_YOUR_KAKAO_REST_API_KEY_HERE
        echo UBION_LITELLM_URL=http://192.168.50.119:4000
        echo UBION_LITELLM_KEY=PUT_YOUR_UBION_LITELLM_KEY_HERE
        echo UBION_VISION_MODEL=mimo-v2.5
        ) > ".env"
        echo [OK] Created default .env.
    )

    echo.
    echo [IMPORTANT] Open .env and enter real API keys before running the app.
)

echo.
echo [STEP 4] Installing dependencies...

if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" install
) else (
    call "%NODE_CMD%" "%NPM_CMD%" install
)
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    echo Try closing running Node.js windows, then run setup.bat again.
    goto FAIL
)

echo [OK] Dependencies installed.

echo.
echo [STEP 5] Cleaning old build output...

if exist "dist" (
    rmdir /s /q "dist"
    if errorlevel 1 (
        echo [ERROR] Could not remove old dist folder.
        echo Close any program using files in dist, then run setup.bat again.
        goto FAIL
    )
    echo [OK] Removed old dist folder.
) else (
    echo [OK] No old dist folder found.
)

echo.
echo [STEP 6] Building app...

if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" run build
) else (
    call "%NODE_CMD%" "%NPM_CMD%" run build
)
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    goto FAIL
)

echo.
echo ====================================================================
echo  Setup completed successfully.
echo ====================================================================
echo.
echo Next step:
echo   Double-click run_local.bat to start the app.
echo.
echo Browser URL:
echo   http://localhost:3000
echo.
goto DONE

:FAIL
echo.
echo ====================================================================
echo  Setup failed.
echo ====================================================================
if "%NO_PAUSE%"=="0" pause
exit /b 1

:DONE
if "%NO_PAUSE%"=="0" pause
exit /b 0
