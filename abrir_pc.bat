@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title UTS Nexus Academico - Escritorio (PC)

REM ==========================================================================
REM  UTS Nexus Academico - Lanzador de la app de escritorio (Windows)
REM
REM  Doble clic para abrir la app SIEMPRE con el codigo mas reciente
REM  (colores, IA y cambios actuales).
REM
REM  Estrategia:
REM   1) Busca un Python que YA tenga PySide6 y corre el codigo fuente.
REM   2) Si ninguno lo tiene, crea un entorno virtual e instala dependencias.
REM   3) El .exe compilado (dist\) queda como ultimo recurso, porque puede
REM      estar desactualizado respecto al codigo.
REM ==========================================================================

cd /d "%~dp0"
set "APP_DIR=desktop_python"
set "EXE=desktop_python\dist\UTS_Academico\UTS_Academico.exe"

echo.
echo ======================================================================
echo   UTS Nexus Academico  -  Aplicacion de Escritorio
echo ======================================================================
echo.

REM --- 1) Buscar un interprete con PySide6 (codigo fuente = siempre actual) --
set "PYEXE="
for %%P in ("py -3.10" "py -3.11" "py -3.12" "py -3.13" "py" "python") do (
    if not defined PYEXE (
        %%~P -c "import PySide6" >nul 2>&1
        if not errorlevel 1 (
            set "PYEXE=%%~P"
            echo [OK] Python con PySide6 encontrado: %%~P
        )
    )
)

if defined PYEXE (
    echo [OK] Ejecutando desde el codigo fuente ^(version actual^)...
    echo.
    cd /d "%~dp0%APP_DIR%"
    %PYEXE% main.py
    goto :fin
)

echo [i] Ningun Python tiene PySide6 instalado. Se preparara un entorno virtual.
echo.

REM --- 2) Verificar que exista algun Python -------------------------------
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo         Instala Python 3.10+ desde https://www.python.org/downloads/
    echo         Marca "Add Python to PATH" durante la instalacion.
    echo.
    echo [i] Como alternativa temporal, se intentara abrir el .exe compilado
    echo     ^(puede estar desactualizado^).
    if exist "%EXE%" start "" "%EXE%"
    pause
    exit /b 1
)

REM --- 3) Crear entorno virtual e instalar --------------------------------
if not exist "%APP_DIR%\.venv" (
    echo [i] Creando entorno virtual (.venv)...
    python -m venv "%APP_DIR%\.venv"
    if errorlevel 1 ( echo [ERROR] No se pudo crear el entorno virtual. & pause & exit /b 1 )
)
call "%APP_DIR%\.venv\Scripts\activate.bat"
python -c "import PySide6" >nul 2>&1
if errorlevel 1 (
    echo [i] Instalando dependencias (puede tardar unos minutos la primera vez)...
    python -m pip install --upgrade pip >nul
    python -m pip install -r "%APP_DIR%\requirements.txt"
    if errorlevel 1 ( echo [ERROR] Fallo la instalacion de dependencias. & pause & exit /b 1 )
)

echo.
echo [OK] Abriendo la aplicacion de escritorio (codigo fuente)...
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
