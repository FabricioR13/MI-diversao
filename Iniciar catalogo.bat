@echo off
title MI Diversao - catalogo
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto sem_node

if exist node_modules goto iniciar
echo.
echo Instalando o que o site precisa. Isso acontece so na primeira vez
echo e pode levar alguns minutos...
echo.
call npm install
if errorlevel 1 goto erro_instalacao

:iniciar
echo.
echo Ligando o site. Deixe esta janela aberta enquanto estiver usando.
echo.
echo   Catalogo: http://localhost:3000
echo   Painel:   http://localhost:3000/admin
echo.
echo Para desligar, feche esta janela.
echo.
start "" /min cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:3000"
call npm run dev
goto fim

:sem_node
echo.
echo O Node.js nao esta instalado neste computador.
echo Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
echo.
echo Enquanto isso, o arquivo Demonstracao.html abre direto no navegador.
goto fim

:erro_instalacao
echo.
echo A instalacao nao terminou. Confira a internet e abra este arquivo de novo.
goto fim

:fim
echo.
pause
