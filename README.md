# DUEL ARENA — APP版

スマホを横向きにして遊ぶAndroid・iPhone用アプリです。
元のWEB版は **[nagisa793/card_game](https://github.com/nagisa793/card_game)**。
ルール・カード・盤面・画像・音源・フェーズ演出・操作処理をそのまま引き継いでいます。

## 遊び方

カードや光る枠をタップして選びます。山札上のボタンで決定・キャンセル・パスします。
左側のカード選択、右側のカード情報、操作・履歴・攻防連鎖の表示もWEB版と同じです。
手札は横にスクロールできます。長いカード説明と選択一覧は縦にスクロールできます。
小さな画面では上部メニューを横にスクロールすると全機能に届きます。

Android版はGitHubの **Actions → Build mobile apps → Artifacts → duel-arena-android-debug** からAPKを取得できます。
iPhone版は同じソースのXcodeプロジェクトを用意しています。実機へのインストールやTestFlight配布にはAppleの署名が必要です。
iOS用Actionsでは署名不要のシミュレータービルドを検証します。実機用IPAは署名情報なしでは作成しません。

## WEB版からの更新

`web/` はWEB版の `dist/` の完全なコピーです。ゲーム処理をAPP用に書き直していません。
APP専用の変更は `app/` とネイティブプロジェクトに保存しています。
`upstream.json` に取り込んだコミットと全ファイルのSHA-256を記録します。

**Sync WEB into APP** が1時間ごとに元リポジトリを読み取り、変更があればAPP側だけへ反映します。
テストが通った内容をAPPの `main` にコミットし、その同じコミットからAndroid APKとiOSシミュレーター版をビルドします。
WEB版のリポジトリ・公開サイトへ書き込む処理はありません。
Actionsのスケジュールには実行遅延があり、長期間活動のない公開リポジトリではGitHubがスケジュールを停止する場合があります。

インストール済みのネイティブアプリは新しいAPK／署名済みiOSビルドで更新します。
アプリ内のゲームファイル・画像・BGMは同梱されるため、読み込んだ対戦はオフラインでも遊べます。
ブラウザ用のAPPビルドにはオフラインキャッシュがあります。プレイ中の対戦を更新のために再読み込みしません。

## 開発

Node.js 22以上で実行します。

```sh
npm ci
npm run check
npm run native:sync
```

元のWEB版の更新を手動で取り込む場合:

```sh
npm run sync:web
npm run check
npm run native:sync
```

Android: `npm run android` でAndroid Studioを開きます。Java 21とAndroid SDKが必要です。
iOS: Macで `npm run ios` を実行してXcodeを開きます。Xcode 26以上が必要です。Swift Package Managerを使用します。
Androidは左右どちらの横向きにも対応します。iPhone・iPadも横向きで表示します。
ゲーム画面を拡大縮小の変換で押し込まず、実際の画面寸法で盤面とタッチ位置を合わせています。

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory www
```

ブラウザで `http://127.0.0.1:8000/` を開くとAPP用の表示を確認できます。
公開用のビルドフォルダーは `www/` です。元のWEB版の `dist/` を公開先にしないでください。

## 構成

| ファイル | 内容 |
|---|---|
| `web/` | 元のWEB版のゲーム・素材。そのまま保存 |
| `app/` | 横向き表示・セーフエリア・タッチ表示の追加 |
| `android/` | Androidアプリのプロジェクト |
| `ios/` | iPhone・iPadアプリのプロジェクト |
| `scripts/` | 取り込み・ハッシュ検証・APPビルド |
| `tests/` | 元のルール回帰テストとAPP用検証 |

素材・音源・同梱ライブラリのライセンス表示は原本に含まれるものを維持しています。
APPとWEBは別の保存領域になるため、WEBの進行中の対戦や端末内設定は自動移行しません。
