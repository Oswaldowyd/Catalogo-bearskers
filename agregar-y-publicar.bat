@echo off
title Agregar seccion de Yupoo y publicar
cd /d "%~dp0"

echo ============================================================
echo    AGREGAR SECCION NUEVA DE YUPOO  +  PUBLICAR EN NETLIFY
echo ============================================================
echo.
echo PASO 1: Scrapear la tienda.
echo    Responde las preguntas que aparezcan abajo:
echo      - Link de la tienda Yupoo
echo      - Categorias que quieres
echo      - Nombre del grupo para el menu
echo      - Maximo de fotos por producto
echo.
echo ------------------------------------------------------------
echo.

node scrapear-yupoo.js
if errorlevel 1 goto errscrape

echo.
echo ------------------------------------------------------------
echo PASO 2: Publicando en Netlify...
echo.

call "%~dp0publicar-oncloud.bat"
goto fin

:errscrape
echo.
echo     ERROR al ejecutar el scraper.
echo     Revisa que Node este instalado y que tengas internet.
echo.
pause

:fin
