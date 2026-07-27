@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title UTS Nexus Academico - Escritorio (PC)

REM ==========================================================================
REM  UTS Nexus Academico - Lanzador de la app de escritorio (Windows)
REM
REM  Doble clic en este archivo para abrir la aplicacion de escritorio.
REM
REM  - Si existe el ejecutable compilado (dist\UTS_Academico.exe) lo abre.
REM  - Si no, corre desde el codigo fuente: crea un entorno virtual,
REM    instala las dependencias y ejecuta la app.
REM ==========================================================================

cd /d "%~dp0"

set "EXE=desktop_python\dist\UTS_Academico\UTS_Academico.exe"
set "APP_DIR=desktop_python"

echo.
echo ======================================================================
echo   UTS Nexus Academico  -  Aplicacion de Escritorio
echo ======================================================================
echo.

REM --- 1) Si hay ejecutable compilado, usarlo -------------------------------
if exist "%EXE%" (
    echo [OK] Ejecutable encontrado. Abriendo la aplicacion...
    start "" "%EXE%"
    goto :fin
)

echo [i] No hay ejecutable compilado. Se ejecutara desde el codigo fuente.
echo.

REM --- 2) Verificar Python -------------------------------------------------
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo         Instala Python 3.10 o superior desde https://www.python.org/downloads/
    echo         Marca la casilla "Add Python to PATH" durante la instalacion.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('python --version') do echo [OK] %%v

REM --- 3) Crear entorno virtual si no existe -------------------------------
if not exist "%APP_DIR%\.venv" (
    echo [i] Creando entorno virtual (.venv)...
    python -m venv "%APP_DIR%\.venv"
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

REM --- 4) Instalar dependencias (solo si falta PySide6) --------------------
call "%APP_DIR%\.venv\Scripts\activate.bat"
python -c "import PySide6" >nul 2>&1
if errorlevel 1 (
    echo [i] Instalando dependencias (puede tardar unos minutos la primera vez)...
    python -m pip install --upgrade pip >nul
    python -m pip install -r "%APP_DIR%\requirements.txt"
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencias ya instaladas.
)

REM --- 5) Ejecutar la aplicacion ------------------------------------------
echo.
echo [OK] Abriendo la aplicacion de escritorio...
echo     (Recuerda: el backend debe estar corriendo, o esta app intentara
echo      levantarlo si encuentra backend\dist\server.js)
echo.
cd /d "%~dp0%APP_DIR%"
python main.py

:fin
echo.
echo ----------------------------------------------------------------------
echo  Credenciales de demo:
echo    Administrador : admin@uts.edu.co      / Uts12345!
echo    Docente       : docente@uts.edu.co    / Uts12345!
echo ----------------------------------------------------------------------
echo.
endlocal
