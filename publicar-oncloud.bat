@echo off
title Publicar catalogo Bearskers en Netlify
cd /d "%~dp0"

echo ============================================================
echo    PUBLICAR CATALOGO BEARSKERS - proxy multi-tienda
echo ============================================================
echo.
echo Carpeta: %cd%
echo.

echo [1/5] Limpiando bloqueos previos de git...
if exist ".git\index.lock" del /f /q ".git\index.lock"
echo     OK.
echo.

echo [2/5] Revisando el indice de git...
git status >nul 2>&1
if not errorlevel 1 goto indiceok
echo     Indice corrupto. Reconstruyendo, no se pierde ningun archivo...
if exist ".git\index" del /f /q ".git\index"
git reset
echo     Indice reconstruido.
:indiceok
echo.

echo [3/6] Convirtiendo imagenes pendientes a URLs de proxy...
echo     Esto consulta Yupoo y puede tardar un poco.
node generar-urls-proxy.js --solo-faltantes
if errorlevel 1 goto errnode
echo.

echo [4/6] Generando paginas por categoria (URLs limpias)...
node generar-paginas.js
if errorlevel 1 goto errpaginas
echo.

echo [5/6] Agregando archivos al commit...
git add -A
echo.

echo [6/6] Subiendo a GitHub. Netlify redeploya solo...
git commit -m "proxy multi-tienda: arreglar imagenes On cloud"
if errorlevel 1 goto nocommit
git push
if errorlevel 1 goto errpush

echo.
echo ============================================================
echo    LISTO. En 1-2 minutos Netlify mostrara las imagenes.
echo    Sitio: https://bearskerss.netlify.app/
echo ============================================================
goto fin

:errnode
echo.
echo     ERROR al ejecutar generar-urls-proxy.js
echo     Revisa que Node este instalado y que tengas internet.
goto fin

:errpaginas
echo.
echo     ERROR al ejecutar generar-paginas.js
echo     Revisa que Node este instalado.
goto fin

:nocommit
echo.
echo     No habia cambios nuevos, o el commit fallo.
echo     Si dice "nothing to commit", ya estaba todo subido.
goto fin

:errpush
echo.
echo     ERROR al hacer push. Revisa tu conexion o credenciales de GitHub.
goto fin

:fin
echo.
pause
