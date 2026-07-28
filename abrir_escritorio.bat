@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title UTS Nexus Academico - Escritorio v2 (Tauri)

REM ==========================================================================
REM  UTS Nexus Academico - Lanzador de la app de escritorio v2
REM
REM  Doble clic para abrir la aplicacion nativa (Tauri + React).
REM
REM  Estrategia:
REM   1) Verifica que el backend este compilado (la app lo arranca sola).
REM   2) Si el .exe ya existe, lo abre al instante.
REM   3) Si no existe, lo compila (requiere Rust + VS Build Tools).
REM
REM  La version anterior en Python sigue disponible en abrir_pc.bat.
REM ==========================================================================

cd /d "%~dp0"
set "EXE=desktop\src-tauri\target\release\uts-nexus-desktop.exe"

echo.
echo ======================================================================
echo   UTS Nexus Academico  -  Aplicacion de Escritorio v2
echo ======================================================================
echo.

REM --- 1) El backend debe estar compilado -----------------------------------
if not exist "backend\dist\server.js" (
    echo [i] El backend no esta compilado. Compilando ahora...
    where node >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Node.js no esta instalado o no esta en el PATH.
        echo         Instalalo desde https://nodejs.org/
        pause
        exit /b 1
    )
    pushd backend
    if not exist "node_modules" call npm install
    call npm run build
    popd
    if not exist "backend\dist\server.js" (
        echo [ERROR] Fallo la compilacion del backend.
        pause
        exit /b 1
    )
    echo [OK] Backend compilado.
    echo.
)

REM --- 2) Abrir el ejecutable si ya existe -----------------------------------
if exist "%EXE%" (
    echo [OK] Abriendo la aplicacion...
    echo     ^(la app arranca el backend por su cuenta^)
    start "" "%EXE%"
    goto :fin
)

REM --- 3) Compilar por primera vez -------------------------------------------
echo [i] El ejecutable no existe todavia. Hay que compilarlo.
echo.

where cargo >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
        set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
    ) else (
        echo [ERROR] Rust no esta instalado.
        echo         Instalalo con:  winget install Rustlang.Rustup
        echo         Y las herramientas de C++ con:
        echo           winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override ^
"--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
        pause
        exit /b 1
    )
)

pushd desktop
if not exist "node_modules" (
    echo [i] Instalando dependencias del frontend...
    call npm install
)
echo [i] Compilando la aplicacion nativa. La primera vez tarda ~10 minutos.
echo.
call npm run desktop:build
popd

if exist "%EXE%" (
    echo.
    echo [OK] Compilacion terminada. Abriendo...
    start "" "%EXE%"
) else (
    echo [ERROR] La compilacion no genero el ejecutable.
    pause
    exit /b 1
)

:fin
echo.
echo ----------------------------------------------------------------------
echo  Credenciales de demo:
echo    Administrador : admin@uts.edu.co      / Uts12345!
echo    Docente       : docente@uts.edu.co    / Uts12345!
echo ----------------------------------------------------------------------
echo.
echo  Instaladores (para instalar en otro equipo):
echo    desktop\src-tauri\target\release\bundle\nsis\  ^(.exe^)
echo    desktop\src-tauri\target\release\bundle\msi\   ^(.msi^)
echo.
timeout /t 5 >nul
endlocal
