@echo off
title Nursing Online Quiz System
echo ====================================================
echo Starting Nursing Online Quiz Server...
echo ====================================================
echo.
echo Student Quiz URL:   http://localhost:3000/
echo Admin Portal URL:   http://localhost:3000/admin
echo Default Admin:      admin / nursing123
echo.
echo Press Ctrl+C in this window to stop the server anytime.
echo ====================================================

start http://localhost:3000/
node server.js
pause
