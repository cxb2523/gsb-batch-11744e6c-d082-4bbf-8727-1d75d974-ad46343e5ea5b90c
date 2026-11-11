@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js not found - opening the download page, install the LTS version and run this again. & start https://nodejs.org/zh-cn & pause & exit /b 1)
node server\server.js %1 --firewall
pause
