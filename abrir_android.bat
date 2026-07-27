@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title UTS Nexus Academico - App Android (Flutter)

REM ==========================================================================
REM  UTS Nexus Academico - Lanzador de la app movil (Flutter / Android)
REM
REM  Prepara el proyecto Flutter y te deja elegir como abrirlo:
REM    1) Abrir en Android Studio
REM    2) Ejecutar directamente en un emulador / telefono conectado
REM    3) Generar el APK instalable (release)
REM ==========================================================================

cd /d "%~dp0"
set "APP_DIR=flutter_app"

echo.
echo ======================================================================
echo   UTS Nexus Academico  -  App Movil (Flutter / Android)
echo ======================================================================
echo.

REM --- 1) Verificar Flutter ------------------------------------------------
where flutter >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Flutter no esta instalado o no esta en el PATH.
    echo         Instala Flutter desde https://docs.flutter.dev/get-started/install/windows
    echo         y agrega la carpeta flutter\bin al PATH.
    echo.
    pause
    exit /b 1
)
echo [OK] Flutter detectado. Verificando entorno...
call flutter --version

REM --- 2) Descargar dependencias ------------------------------------------
echo.
echo [i] Descargando dependencias del proyecto (flutter pub get)...
pushd "%APP_DIR%"
call flutter pub get
if errorlevel 1 (
    echo [ERROR] Fallo 'flutter pub get'. Revisa el mensaje de arriba.
    popd
    pause
    exit /b 1
)
popd

REM --- 3) Menu de opciones -------------------------------------------------
:menu
echo.
echo ----------------------------------------------------------------------
echo   Que quieres hacer?
echo ----------------------------------------------------------------------
echo   [1] Abrir el proyecto en Android Studio
echo   [2] Ejecutar en emulador / telefono conectado (flutter run)
echo   [3] Generar APK instalable (release)
echo   [4] Salir
echo ----------------------------------------------------------------------
set /p "OPT=Elige una opcion (1-4): "

if "%OPT%"=="1" goto :studio
if "%OPT%"=="2" goto :run
if "%OPT%"=="3" goto :apk
if "%OPT%"=="4" goto :fin
echo Opcion no valida.
goto :menu

REM --- Opcion 1: Abrir en Android Studio -----------------------------------
:studio
echo.
echo [i] Buscando Android Studio...
set "STUDIO="
if exist "%ProgramFiles%\Android\Android Studio\bin\studio64.exe" set "STUDIO=%ProgramFiles%\Android\Android Studio\bin\studio64.exe"
if exist "%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe" set "STUDIO=%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe"
if exist "%ProgramFiles%\Android\Android Studio1\bin\studio64.exe" set "STUDIO=%ProgramFiles%\Android\Android Studio1\bin\studio64.exe"

if defined STUDIO (
    echo [OK] Abriendo Android Studio con el proyecto...
    start "" "!STUDIO!" "%~dp0%APP_DIR%"
    echo.
    echo     En Android Studio: espera a que sincronice Gradle, elige un
    echo     dispositivo/emulador arriba y pulsa el boton verde Run.
) else (
    echo [!] No encontre Android Studio en las rutas habituales.
    echo     Abrelo manualmente y usa:  File ^> Open  ^>  y elige la carpeta:
    echo     %~dp0%APP_DIR%
)
echo.
pause
goto :menu

REM --- Opcion 2: flutter run ------------------------------------------------
:run
echo.
echo [i] Dispositivos disponibles:
pushd "%APP_DIR%"
call flutter devices
echo.
echo [i] Ejecutando la app (flutter run)...
echo     Nota: en EMULADOR la API se resuelve sola en http://10.0.2.2:4000
echo           en un TELEFONO REAL, en la pantalla de login toca el engranaje
echo           y escribe la IP de tu PC, ej: http://192.168.1.20:4000
echo.
call flutter run
popd
echo.
pause
goto :menu

REM --- Opcion 3: build apk -------------------------------------------------
:apk
echo.
echo [i] Generando APK release (puede tardar varios minutos)...
pushd "%APP_DIR%"
call flutter build apk --release
if errorlevel 1 (
    echo [ERROR] Fallo la generacion del APK.
    popd
    pause
    goto :menu
)
popd
echo.
echo [OK] APK generado en:
echo     %~dp0%APP_DIR%\build\app\outputs\flutter-apk\app-release.apk
echo     Copialo a tu telefono e instalalo (activa "Origenes desconocidos").
echo.
pause
goto :menu

:fin
echo.
echo Hasta luego.
endlocal
