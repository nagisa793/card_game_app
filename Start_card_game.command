#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo '起動にはPython 3が必要です。Python 3をインストールしてから開いてください。'
  read -r -p 'Enterで閉じます。'
  exit 1
fi
python3 local_web.py
