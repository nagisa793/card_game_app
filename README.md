# DUEL ARENA — スマホ横向きWEBアプリ

遊ぶURL: **https://duel-arena-app.nagisa793.chatgpt.site/**

SafariやChromeでURLを開いてスマホを横向きにすると遊べます。
iPhoneはSafariの共有から「ホーム画面に追加」するとWEBアプリとして開けます。
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
