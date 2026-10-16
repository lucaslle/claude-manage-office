@echo off
rem Double-cliquez pour lancer le tableau de bord : installe ce qu'il faut, démarre le serveur et ouvre le navigateur.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 ou plus est requis : https://nodejs.org
  pause
  exit /b 1
)
node scripts\start.mjs %*
if errorlevel 1 pause
