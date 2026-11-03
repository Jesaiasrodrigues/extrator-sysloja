@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Agente web - Conversor SysLoja

rem ==== 1. Python (3.7 ou superior, com tkinter) ====
call :localizar_python
if not defined PY call :instalar_python
if not defined PY (
    echo.
    echo Nao foi possivel encontrar nem instalar o Python.
    echo Deixe o instalador python-3.x.x.exe nesta pasta e rode de novo.
    pause
    exit /b 1
)
echo Python: %PY%

rem ==== 2. Dependencias (pymysql e openpyxl) ====
"%PY%" -c "import pymysql, openpyxl" >nul 2>&1
if errorlevel 1 (
    call :instalar_dependencias
    if errorlevel 1 (
        echo.
        echo Falha ao instalar as dependencias.
        pause
        exit /b 1
    )
)

rem ==== 3. Abre o agente (sem janela preta) ====
set "PYW=%PY:python.exe=pythonw.exe%"
if not exist "%PYW%" set "PYW=%PY%"
start "" "%PYW%" "%~dp0agente_web.py"
exit /b 0


:localizar_python
set "PY="
set "TESTE=import sys, tkinter; assert sys.version_info >= (3, 7); print(sys.executable)"
for /f "delims=" %%P in ('py -3 -c "%TESTE%" 2^>nul') do set "PY=%%P"
if defined PY exit /b 0
for /f "delims=" %%P in ('python -c "%TESTE%" 2^>nul') do set "PY=%%P"
if defined PY exit /b 0
rem recem-instalado: o PATH desta janela ainda nao foi atualizado
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*" "%ProgramFiles%\Python3*") do (
    if exist "%%~D\pythonw.exe" if exist "%%~D\python.exe" set "PY=%%~D\python.exe"
)
exit /b 0


:instalar_python
set "INSTALADOR="
for %%F in ("%~dp0python-3*.exe") do set "INSTALADOR=%%~fF"
if not defined INSTALADOR (
    echo Instalador do Python nao encontrado nesta pasta.
    exit /b 1
)
echo Instalando o Python a partir de:
echo   %INSTALADOR%
echo Aguarde, isso pode levar alguns minutos...
start "" /wait "%INSTALADOR%" /quiet InstallAllUsers=0 InstallLauncherAllUsers=0 PrependPath=1 Include_launcher=1 Include_pip=1 Include_tcltk=1 Include_test=0 Include_doc=0
call :localizar_python
if defined PY echo Python instalado.
exit /b 0


:instalar_dependencias
echo Instalando as dependencias...
if exist "%~dp0pacotes\*.whl" (
    rem sem internet: usa os pacotes que acompanham o programa
    "%PY%" -m pip install --user --disable-pip-version-check -q --no-index --find-links "%~dp0pacotes" pymysql openpyxl
    if not errorlevel 1 exit /b 0
)
"%PY%" -m pip install --user --disable-pip-version-check -q pymysql openpyxl
exit /b %errorlevel%
