#!/usr/bin/env bash
set -euo pipefail
python3 -m pip install -r requirements.txt
npm run install:all
npm run dev:backend &
npm run dev:frontend &
npm run dev:bot &
wait
