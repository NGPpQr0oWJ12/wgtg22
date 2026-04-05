@echo off
echo Packaging project for deployment...

:: Create release.zip
:: We include the 'deploy' folder so setup.sh/update.sh are inside the archive.
:: We exclude node_modules, .env (secrets), .git (history), .vscode (ide settings), and the zip itself.

tar -a -c -f release.zip --exclude=node_modules --exclude=.env --exclude=.git --exclude=.vscode --exclude=release.zip *

echo.
echo ==========================================
echo Release packaged to: release.zip
echo Inside you will find: deploy/setup.sh
echo ==========================================
pause
