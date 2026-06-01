@echo off
REM First-time setup: install Node deps and Python War Thunder resolver deps.
python -m pip install -r requirements.txt
npm run install:all
start cmd /k "npm run dev:backend"
start cmd /k "npm run dev:frontend"
start cmd /k "npm run dev:bot"
