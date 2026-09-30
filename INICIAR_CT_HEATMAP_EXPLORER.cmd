@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 22 ou superior.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Build ausente. Execute npm ci e npm run build antes de iniciar.
  pause
  exit /b 1
)
echo Abra http://127.0.0.1:8080 no navegador.
echo Mantenha esta janela aberta. Ctrl+C encerra o servidor.
node local\server.mjs
if errorlevel 1 pause
