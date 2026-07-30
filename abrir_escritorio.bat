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
REM   2) Reinstala dependencias si package.json cambio desde la ultima vez.
REM   3) Recompila si el codigo fuente es mas nuevo que el ejecutable.
REM   4) Abre la aplicacion.
REM
REM  Uso:
REM   abrir_escritorio.bat             comportamiento normal (recomendado)
REM   abrir_escritorio.bat rapido      abre el .exe existente sin comprobar nada
REM   abrir_escritorio.bat recompilar  fuerza una compilacion
REM
REM  Los pasos 2 y 3 existen porque abrir un .exe viejo es el peor fallo
REM  posible: la app arranca, no da ningun error, y muestra una version
REM  anterior del programa. El usuario no tiene forma de darse cuenta.
REM
REM  La version anterior en Python sigue disponible en abrir_pc.bat.
REM ==========================================================================

cd /d "%~dp0"
set "EXE=desktop\src-tauri\target\release\uts-nexus-desktop.exe"
set "MODO=%~1"

echo.
echo ======================================================================
echo   UTS Nexus Academico  -  Aplicacion de Escritorio v2
echo ======================================================================
echo.

if /i "%MODO%"=="rapido" (
    if exist "%EXE%" (
        echo [i] Modo rapido: se abre el ejecutable existente sin comprobar
        echo     si esta al dia.
        start "" "%EXE%"
        goto :fin
    )
    echo [i] No hay ejecutable todavia; el modo rapido no aplica.
    echo.
)

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

REM --- 2) Dependencias del frontend ------------------------------------------
REM  Si package.json cambio despues de la ultima instalacion falta alguna
REM  dependencia, y la compilacion fallaria con un import sin resolver: un error
REM  bastante mas dificil de leer que este aviso.
set "NEEDS_INSTALL="
call :comprobar dependencias RESP
if /i "!RESP!"=="SI" set "NEEDS_INSTALL=1"

if defined NEEDS_INSTALL (
    echo [i] Hay dependencias nuevas o sin instalar. Instalando...
    pushd desktop
    call npm install
    popd
    if not exist "desktop\node_modules" (
        echo [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
    echo [OK] Dependencias al dia.
    echo.
)

REM --- 3) Decidir si hay que compilar ----------------------------------------
set "NEEDS_BUILD="
if /i "%MODO%"=="recompilar" (
    echo [i] Compilacion forzada por parametro.
    set "NEEDS_BUILD=1"
) else (
    call :comprobar compilacion RESP
    if /i "!RESP!"=="SI" (
        if exist "%EXE%" (
            echo [i] El codigo fuente cambio despues de la ultima compilacion.
            echo     Se recompila para que veas la version actual.
        ) else (
            echo [i] El ejecutable no existe todavia. Hay que compilarlo.
        )
        set "NEEDS_BUILD=1"
    ) else (
        echo [OK] El ejecutable esta al dia.
    )
)

REM --- 4) Compilar si hace falta ---------------------------------------------
if defined NEEDS_BUILD (
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

    echo [i] Compilando la aplicacion nativa.
    echo     La primera vez tarda ~10 minutos; las siguientes, mucho menos.
    echo.
    pushd desktop
    call npm run desktop:build
    popd

    if not exist "%EXE%" (
        echo.
        echo [ERROR] La compilacion no genero el ejecutable.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Compilacion terminada.
)

echo [OK] Abriendo la aplicacion...
echo     ^(la app arranca el backend por su cuenta^)
start "" "%EXE%"
goto :fin

REM --------------------------------------------------------------------------
REM  :comprobar <modo> <variable>
REM
REM  Deja SI o NO en la variable indicada. La comparacion de fechas vive en
REM  desktop\scripts\comprobar-actualizado.ps1 y no aqui: una tuberia de
REM  PowerShell dentro de un `for /f` de cmd necesita un escapado que falla
REM  callado, y el sintoma es que el lanzador da por bueno un .exe viejo.
REM
REM  El resultado se pasa por archivo temporal en vez de por `for /f` para no
REM  depender de como cmd parsea el comando incrustado.
REM --------------------------------------------------------------------------
:comprobar
set "_TMP=%TEMP%\uts_nexus_%~1.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File "desktop\scripts\comprobar-actualizado.ps1" -Modo %~1 > "%_TMP%" 2>nul
set "_R=SI"
if exist "%_TMP%" set /p _R=<"%_TMP%"
del "%_TMP%" >nul 2>&1
REM  Sin respuesta legible se asume SI: rehacer de mas cuesta tiempo, abrir un
REM  binario obsoleto cuesta una sesion de depuracion sobre codigo que no es.
if not defined _R set "_R=SI"
set "%~2=%_R%"
goto :eof

:fin
echo.
echo ----------------------------------------------------------------------
echo  Credenciales de demo:
echo    Administrador : admin@uts.edu.co      / (la que genere el seed)
echo    Docente       : docente@uts.edu.co    / (la que genere el seed)
echo ----------------------------------------------------------------------
echo.
echo  Instaladores (para instalar en otro equipo):
echo    desktop\src-tauri\target\release\bundle\nsis\  ^(.exe^)
echo    desktop\src-tauri\target\release\bundle\msi\   ^(.msi^)
echo.
REM  2>nul: timeout aborta con un error si la entrada esta redirigida, cosa que
REM  pasa al llamar al lanzador desde otro script. La pausa es cosmetica; su
REM  fallo no deberia ser lo ultimo que se lea en pantalla.
timeout /t 5 >nul 2>&1
endlocal
