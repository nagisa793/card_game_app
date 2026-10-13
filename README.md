# DUEL ARENA — スマホ横向きWEBアプリ

## ローカルで起動する

GitHubの「Code → Download ZIP」で初回だけダウンロードして展開します。
Macで `Start_card_game.command` を開くとローカルWEBサーバーとブラウザが起動します。Python 3が必要です。Node.jsやnpmは起動に不要です。

MacのURL: **http://localhost:8766/**

iPhoneはMacと同じWi-Fiに接続し、起動したウィンドウに表示される `http://MacのIPアドレス:8766/` をSafariで開きます。
スマホを横向きにすると遊べます。Macのサーバーを起動している間はローカルURLで利用できます。
iPhone上の `localhost` はiPhone自身なのでMacへの接続用URLにはなりません。
ゲーム・画像・音源はMac内のファイルから配信します。初回ダウンロード後のゲーム起動にインターネットは不要です。
起動中はGitHubの更新を確認して自動で取り込みます。毎回のダウンロードや入れ替えは不要です。

公開プレビュー: https://duel-arena-app.nagisa793.chatgpt.site/
この公開プレビューはlocalhostや自宅内IPのURLではありません。

カードや光る枠をタップして選択し、山札上のボタンで決定・キャンセル・パスします。
手札と上部メニューは横に、長いカード説明と選択一覧は縦にスクロールできます。

元のWEB版は [nagisa793/card_game](https://github.com/nagisa793/card_game)。
ルール・カード・盤面・画像・音源・フェーズ演出・操作を引き継いでいます。
このリポジトリはブラウザで遊ぶWEBアプリです。

## 更新

GitHub Actionsが元のWEB版のmainを読み取り、変更があればAPP側だけへコピーします。
テストが通った同じビルドをAPPの公開確認でURLへ反映します。元のWEB版へ書き込む処理はありません。
`web/` は元の `dist/` の完全コピーです。取り込みコミットと全ファイルのSHA-256を `upstream.json` に記録します。
スマホ用の変更は `app/` に保存するためWEB更新で上書きされません。
対戦中の更新でゲームを再読み込みせず、次に開いたときに最新版を取り込みます。
画像・音源を含むキャッシュの準備が完了した後はオフラインでも利用できます。

## 開発

Node.js 22以上:

```sh
npm ci
npm run sync:web
npm run check
```

公開用フォルダーは `www/` です。ローカル確認:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory www
```

ブラウザで `http://127.0.0.1:8000/` を開きます。
素材・音源・同梱ライブラリのライセンス表示は原本のものを維持しています。
