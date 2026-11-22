@echo off
rem Career OS - host bridge: in-app AI through the Claude Code already logged in on this PC.
rem Keep this window open while you use the app (Quick Import analysis, Ask, offer analysis).
rem Start automatically: Win+R, shell:startup, add a shortcut to this file.
cd /d "%~dp0.."
node bridge\claude-bridge.mjs
if errorlevel 1 pause
