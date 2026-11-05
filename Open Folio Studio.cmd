@echo off
cd /d "%~dp0"
node publisher.mjs --open
if errorlevel 1 pause
