import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
web = json.loads((root / 'upstream.json').read_text())
package = json.loads((root / 'release/DUEL-ARENA/build-info.json').read_text())
print(f'''DUEL ARENAをlocalhostで起動するWEBアプリです。

1. 下の **DUEL-ARENA-local-mac.zip** をダウンロードして展開します。
2. **Start_card_game.command** を開きます。
3. **http://localhost:8766/** がブラウザで開きます。

Python・Node.jsのインストールは不要です。Apple Silicon／Intelの起動環境は自動で選ばれます。
ゲームを使う間は起動したウィンドウを開いておいてください。
起動中はGitHubのゲーム更新を自動で保存します。対戦中の再読み込みは行いません。

検証：元のルール・画像・音源のハッシュ、横向きのタップ操作、localhost起動、音源Range、Mac両環境の同梱サーバー起動。

WEB v{web['webVersion']} / WEB commit `{web['commit']}`
APP commit `{package['appCommit']}`

元のWEBリポジトリ・既存公開WEBへの変更はありません。''')
