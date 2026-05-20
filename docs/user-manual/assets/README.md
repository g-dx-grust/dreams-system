# キャプチャ画像置き場

利用者向け説明書で使用する画面キャプチャをここに保存します。

## 自動生成コマンド

Playwright による自動撮影を用意しています。

```bash
SCREENSHOT_EMAIL='dev-user@example.com' \
SCREENSHOT_PASSWORD='password' \
pnpm docs:screenshots
```

必要に応じて以下も指定できます。

- `SCREENSHOT_BASE_URL`
  既存のローカル環境へ接続したい場合の URL。既定値は `http://127.0.0.1:3100`
- `PORT`
  Playwright が起動するローカル開発サーバーのポート。既定値は `3100`
- `SCREENSHOT_CASE_ID`
  撮影対象の案件 ID を固定したい場合
- `SCREENSHOT_TEMPLATE_ID`
  撮影対象のテンプレート ID を固定したい場合
- `SCREENSHOT_OUTPUT_DIR`
  出力先を変えたい場合。既定値は `docs/user-manual/assets`

ブラウザが未導入の場合は先に以下を実行します。

```bash
pnpm docs:screenshots:install
```

PDF 資料を出力する場合は以下を実行します。

```bash
pnpm docs:pdf
```

出力先:

- `docs/user-manual/operation-manual.print.html`
- `docs/user-manual/operation-manual.pdf`

## 保存ルール

- 画像形式は `png`
- 命名は `screenshot-shotlist.md` の推奨ファイル名に合わせる
- 個人情報や実案件情報は写さず、必ずダミーデータで撮影する

## 例

- `01-login.png`
- `02-dashboard.png`
- `09-case-documents.png`
- `17-audit-logs.png`
