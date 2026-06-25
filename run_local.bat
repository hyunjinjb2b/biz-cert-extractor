@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Business Registration Extractor - Local Runner

cls
echo ====================================================================
echo  Business Registration Extractor - Local Runner
echo ====================================================================
echo.
echo This script checks Node.js, installs packages, builds the app,
echo and starts the local service.
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
    echo [ERROR] npm was not found in portable Node.js folder.
    echo.
    echo Expected one of these files:
    echo   %~dp0node\npm.cmd
    echo   %~dp0node\node_modules\npm\bin\npm-cli.js
    echo.
    echo Your node folder must contain:
    echo   node.exe
    echo   npm.cmd
    echo   npx.cmd
    echo   node_modules
    echo.
    pause
    exit /b 1
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
echo.
echo Please install Node.js LTS, or place portable Node.js in this folder.
echo.
echo Portable folder example:
echo   current-folder\node\node.exe
echo   current-folder\node\npm.cmd
echo.
pause
exit /b 1

:VERIFY_NODE
echo.
echo [STEP 1-1] Verifying node and npm commands...
echo.

echo node location:
where node

if errorlevel 1 (
    echo.
    echo [ERROR] node command is not available in PATH.
    echo Please check this file:
    echo   %~dp0node\node.exe
    echo.
    pause
    exit /b 1
)

echo.
echo Node version:
node -v

if errorlevel 1 (
    echo.
    echo [ERROR] node version check failed.
    echo.
    pause
    exit /b 1
)

echo.
echo npm location:
if "%NPM_MODE%"=="cmd" (
    where npm
) else (
    echo %NPM_CMD%
)

echo.
echo NPM version:
if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" -v
) else (
    call "%NODE_CMD%" "%NPM_CMD%" -v
)

if errorlevel 1 (
    echo.
    echo [ERROR] npm version check failed.
    echo Please check your portable Node.js package.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] node and npm are ready.

:CHECK_ENV
echo.
echo [STEP 2] Checking .env file...

if not exist ".env" (
    echo [INFO] Creating .env file...

    (
    echo # Local environment
    echo # Replace the values below with your real API keys.
    echo.
    echo APP_URL=http://localhost:3000
    echo KAKAO_REST_API_KEY=PUT_YOUR_KAKAO_REST_API_KEY_HERE
    echo UBION_LITELLM_URL=http://192.168.50.119:4000
    echo UBION_LITELLM_KEY=PUT_YOUR_UBION_LITELLM_KEY_HERE
    echo UBION_VISION_MODEL=gpt-4o
    ) > ".env"

    echo.
    echo [IMPORTANT] .env file has been created.
    echo Please open .env and enter your real API keys.
    echo Then run this bat file again.
    echo.
    pause
    exit /b 0
)

echo [OK] .env file found.
echo [INFO] Validating API keys...

call :READ_ENV_VALUE APP_URL APP_URL_VALUE
call :READ_ENV_VALUE KAKAO_REST_API_KEY KAKAO_KEY
call :READ_ENV_VALUE UBION_LITELLM_URL UBION_URL
call :READ_ENV_VALUE UBION_LITELLM_KEY UBION_KEY
call :READ_ENV_VALUE UBION_VISION_MODEL UBION_MODEL

set "ENV_ERROR=0"

if "!UBION_URL!"=="" (
    echo [ERROR] UBION_LITELLM_URL is empty.
    set "ENV_ERROR=1"
)

if "!UBION_KEY!"=="" (
    echo [ERROR] UBION_LITELLM_KEY is empty.
    set "ENV_ERROR=1"
)

if /i "!UBION_KEY!"=="PUT_YOUR_UBION_LITELLM_KEY_HERE" (
    echo [ERROR] UBION_LITELLM_KEY still has placeholder value.
    set "ENV_ERROR=1"
)

if "!UBION_MODEL!"=="" (
    echo [INFO] UBION_VISION_MODEL is empty. Using default: gpt-4o
    set "UBION_MODEL=gpt-4o"
)

if "!APP_URL_VALUE!"=="" (
    echo [INFO] APP_URL is empty. Using default: http://localhost:3000
    set "APP_URL_VALUE=http://localhost:3000"
)

if /i "!APP_URL_VALUE!"=="MY_APP_URL" (
    echo [INFO] APP_URL still has example value. Using default: http://localhost:3000
    set "APP_URL_VALUE=http://localhost:3000"
)

if "!ENV_ERROR!"=="1" (
    echo.
    echo ====================================================================
    echo  API key configuration error
    echo ====================================================================
    echo.
    echo Please open the .env file and enter your real API keys.
    echo.
    echo Example:
    echo   APP_URL=http://localhost:3000
    echo   UBION_LITELLM_URL=http://192.168.50.119:4000
    echo   UBION_LITELLM_KEY=your_real_ubion_litellm_key
    echo   UBION_VISION_MODEL=gpt-4o
    echo   KAKAO_REST_API_KEY=your_real_kakao_rest_api_key
    echo.
    echo Notes:
    echo   - UBION_LITELLM_KEY is required for AI OCR.
    echo   - KAKAO_REST_API_KEY is optional for OCR, but required for zip-code lookup.
    echo   - Kakao key must be the REST API key, not the JavaScript key.
    echo.
    pause
    exit /b 1
)

set "APP_URL=!APP_URL_VALUE!"
set "KAKAO_REST_API_KEY=!KAKAO_KEY!"
set "UBION_LITELLM_URL=!UBION_URL!"
set "UBION_LITELLM_KEY=!UBION_KEY!"
set "UBION_VISION_MODEL=!UBION_MODEL!"

echo [OK] API keys look configured.
echo [OK] Environment variables loaded for this run.

:CHECK_PACKAGE
echo.
echo [STEP 3] Checking project files...

if not exist "package.json" (
    echo.
    echo [ERROR] package.json was not found.
    echo This bat file must be placed in the project root folder.
    echo.
    echo Current folder:
    echo %cd%
    echo.
    pause
    exit /b 1
)

echo [OK] package.json found.

echo.
echo [STEP 4] Cleaning failed install leftovers...

if exist "node_modules\.package-lock.json" (
    echo [INFO] Partial npm install data found.
)

echo [INFO] If previous install failed, node_modules may be locked.
echo [INFO] Continuing without forced delete.
echo.

echo [STEP 5] Checking node_modules...

if not exist "node_modules" (
    echo [INFO] node_modules folder not found.
    echo [INFO] Running npm install...
    echo.

    if "%NPM_MODE%"=="cmd" (
        call "%NPM_CMD%" install
    ) else (
        call "%NODE_CMD%" "%NPM_CMD%" install
    )

    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        echo.
        echo Recommended fix:
        echo   1. Close all CMD, VS Code, and Explorer preview windows.
        echo   2. Delete the node_modules folder manually.
        echo   3. Run this bat file again.
        echo.
        echo Optional CMD cleanup:
        echo   taskkill /f /im node.exe
        echo   rmdir /s /q node_modules
        echo.
        pause
        exit /b 1
    )

    echo.
    echo [OK] npm install completed.
) else (
    echo [OK] node_modules already exists.
)

echo.
echo [STEP 6] Choose run mode
echo ====================================================================
echo  1. Development mode
echo  2. Production build and start
echo ====================================================================
echo.

set "RUN_MODE=2"
set /p RUN_MODE="Select mode 1 or 2. Default is 2: "

if "%RUN_MODE%"=="1" goto DEV_MODE
if "%RUN_MODE%"=="2" goto PROD_MODE

echo Invalid input. Starting production mode.
goto PROD_MODE

:DEV_MODE
echo.
echo ====================================================================
echo  Starting development mode...
echo ====================================================================
echo.

call :CHECK_PORT_3000
if errorlevel 1 (
    pause
    exit /b 0
)

if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" run dev
) else (
    call "%NODE_CMD%" "%NPM_CMD%" run dev
)

echo.
echo Process ended.
pause
exit /b 0

:PROD_MODE
echo.
echo ====================================================================
echo  Building production app...
echo ====================================================================
echo.

call :CHECK_PORT_3000
if errorlevel 1 (
    pause
    exit /b 0
)

if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" run build
) else (
    call "%NODE_CMD%" "%NPM_CMD%" run build
)

if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

call :CHECK_PORT_3000
if errorlevel 1 (
    pause
    exit /b 0
)

cls
echo ====================================================================
echo  Build completed. Starting local production server...
echo ====================================================================
echo.
echo Browser URL:
echo http://localhost:3000
echo.
echo Do not close this window while using the app.
echo ====================================================================
echo.

if "%NPM_MODE%"=="cmd" (
    call "%NPM_CMD%" run start
) else (
    call "%NODE_CMD%" "%NPM_CMD%" run start
)

echo.
echo Process ended.
pause
exit /b 0

:CHECK_PORT_3000
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo [INFO] A server is already running on http://localhost:3000
    echo Please use the existing browser URL, or close the running server first.
    echo.
    exit /b 1
)
exit /b 0

:READ_ENV_VALUE
set "%~2="
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="%~1" (
        set "VAL=%%B"
        set "VAL=!VAL:"=!"
        set "%~2=!VAL!"
    )
)
exit /b 0
