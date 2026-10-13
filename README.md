# DUEL ARENA — GitHubで遊ぶWEBアプリ

GitHub Pagesの公開先は **https://nagisa793.github.io/card_game_app/** です。
公開設定後は、このURLをSafariまたはChromeで開き、スマホを横向きにして遊べます。ダウンロードやMacの起動は不要です。
元のWEB版のルール・カード・盤面・演出・操作を維持し、スマホの横向き表示を `app/` に追加しています。

## GitHub Pagesの公開設定

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。
**Actions → Sync WEB app → Run workflow** を実行すると、検証済みの `www/` がGitHub Pagesに公開されます。
以降はWEB更新を自動取り込みし、同じURLへ公開します。対戦中に強制リロードはしません。
公開内容の元WEBコミットは `version.json` で確認できます。

以下のMac用localhost機能は、手元で起動したい場合の補助機能です。

## Macで起動する

1. [起動環境を同梱したZIPをダウンロード](https://github.com/nagisa793/card_game_app/releases/latest/download/DUEL-ARENA-local-mac.zip)します。
2. ZIPを展開し、`DUEL-ARENA` フォルダー内の **Start_card_game.command** を開きます。
3. ブラウザで **http://localhost:8766/** が自動で開きます。

Python、Node.js、npmのインストールは不要です。Apple Silicon／Intelの判別は起動ファイルが自動で行います。
起動したウィンドウを開いている間、ゲームを利用できます。閉じるとサーバーは停止します。
もう一度起動ファイルを開いた場合は、起動済みのゲームを開きます。
初回ダウンロード後はインターネットがなくてもゲーム・画像・音源を利用できます。

このURLは、起動ファイルを開いたMac自身を指します。GitHub上で作成しただけで手元のMacのサーバーが起動することはありません。

## 更新

- APPリポジトリ内のGitHub Actionsが元WEBのmainを読み取り、`dist/` をAPPの `web/` へコピーします。
- ルール・ハッシュ・音源・localhost起動・横向きのタップ操作を検証してから、Mac用の配布ZIPをGitHub Releasesに掲載します。
- 起動中のローカルサーバーはGitHub APP最新版を確認してゲームを自動で保存します。毎回のダウンロードやファイルの入れ替えは不要です。
- 更新の保存中や接続失敗時も、読み込み済みの完全なゲームを使い続けます。対戦中に更新のための再読み込みは行いません。

取り込んだWEBコミットと全原本のSHA-256は `upstream.json` に記録します。
スマホ用の変更・ユーザー編集は `app/` に保持します。元の [nagisa793/card_game](https://github.com/nagisa793/card_game) へ書き込む処理はありません。

## スマホの操作

横向きで、カードや光る枠をタップして選択し、山札上のボタンで決定・キャンセル・パスします。
手札と上部メニューは横に、長いカード説明と選択一覧は縦にスクロールできます。

スマホの `localhost` はスマホ自身です。このMac用パッケージを起動したMacの `localhost` に、スマホから直接接続することはできません。
同じWi-Fi内のスマホからMacへ接続する補助機能は、開発時に `python3 local_web.py --host 0.0.0.0` で起動できます。その場合は表示されたMacのIPのURLを使い、Macの起動も必要です。

## 開発者用：GitHubのソースから起動

ソースをダウンロードした場合はPython 3で起動できます。配布ZIPにはPythonの起動環境を同梱しています。

```sh
python3 local_web.py
```

Node.js 22以上での検証：

```sh
npm ci
npm run check
python3 tests/local-web.py
python3 tests/local-launch.py
```

`npm start` でもlocalhostを起動できます。公開用のビルド出力は `www/` です。
既存の公開確認用URLは `publication.json` に記録しています。localhostでの起動には使用しません。
素材・音源・同梱ライブラリのライセンス表示は原本のものを維持しています。起動環境のライセンスは配布ZIPの `licenses/` に含めます。
