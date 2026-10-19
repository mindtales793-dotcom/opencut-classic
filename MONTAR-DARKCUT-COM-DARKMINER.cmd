@echo off
setlocal
cd /d "%~dp0"
title DARKCUT + DARKMINER - Compilacao Windows
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0MONTAR-DARKCUT-COM-DARKMINER.ps1"
if errorlevel 1 (
 echo.
 echo Deu erro. Tire uma foto desta janela e envie para o ChatGPT.
 pause
 exit /b 1
)
echo Instalador gerado. A pasta foi aberta.
pause
