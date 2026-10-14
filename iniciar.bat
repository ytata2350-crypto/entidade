@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22.13 ou mais recente para iniciar o jogo Entidade.
  pause
  exit /b 1
)
echo Abra http://127.0.0.1:3210 no navegador.
echo Para encerrar, pressione Ctrl+C.
node --env-file-if-exists=.env src/server.js
pause
