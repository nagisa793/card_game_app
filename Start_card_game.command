#!/bin/bash
cd "$(dirname "$0")" || exit 1
case "$(uname -m)" in
  arm64) duel_runtime='_runtime/macos-arm64/game-server' ;;
  *) duel_runtime='_runtime/macos-x64/game-server' ;;
esac
if [ -x "$duel_runtime" ]; then
  "$duel_runtime" "$@"
elif command -v python3 >/dev/null 2>&1 && python3 -c 'import http.server' >/dev/null 2>&1; then
  python3 local_web.py "$@"
else
  echo '起動環境を同梱した版をダウンロードしてください。Pythonのインストールは不要です。'
  echo 'https://github.com/nagisa793/card_game_app/releases/latest/download/DUEL-ARENA-local-mac.zip'
  read -r -p 'Enterで閉じます。'
  exit 1
fi
duel_status=$?
if [ "$duel_status" -ne 0 ]; then
  echo '起動できませんでした。上に表示された内容を確認してください。'
  read -r -p 'Enterで閉じます。'
fi
exit "$duel_status"
