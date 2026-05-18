@echo off
set "NODE_PATH=C:\Users\Administrator\AppData\Local\OpenAI\Codex\bin\node.exe"
if not exist "%NODE_PATH%" (
  echo Node runtime not found:
  echo %NODE_PATH%
  echo.
  echo Please update start.cmd or start.ps1 with the correct node.exe path.
  pause
  exit /b 1
)

cd /d "%~dp0"
echo Starting AI order demo...
echo Open http://localhost:3000
echo.
"%NODE_PATH%" server.js
