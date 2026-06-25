# カレンダー Phase 1 要件メモ（廃止済み）

> 2026-06-26: カレンダー機能はUI/APIから削除済み。既存DBテーブル・監査ログ履歴は破壊せず残置する。

## 目的

複数人の予定を、横軸=社員、縦軸=時間の「日表示」で俯瞰できるカレンダーを追加する。
既存の案件管理システムと同じSupabaseプロジェクト・認証・`users`/`cases`テーブルを使う。

## 今回実装する範囲

- `schedules`/`schedule_types`/`daily_reports`/`comments`をマイグレーションで追加する。
- `audit_logs.entity_id_uuid`を追加し、UUID主キーの予定変更も監査ログに残せるようにする。
- 予定種別の色はHEXではなく、dreaMsのデザイントークン名をDBへ保存する。
- `/calendar`に日表示・週表示・月表示を追加する。
- 社員列は横スクロールで表示する。スマホ専用UIは作らない。
- 担当者フィルターはチェックボックスで切り替える。
- 予定ブロックは予定種別ごとの色で表示する。
- 予定はドラッグ＆ドロップで時間・担当者を変更できる。
- 予定クリック時はポップアップではなく、同一画面下部の詳細パネルへ表示する。
- 予定移動時は`sync_source='app'`、`sync_status='pending'`に戻し、後続のLark同期対象にする。
- `/calendar`から予定を登録・編集・削除できるようにする。
- 予定登録・編集時は`cases`を案件番号でサジェスト検索し、選択した`case_id`/`case_number`を`schedules`へ保存する。
- 案件に紐づく予定の詳細には案件番号・案件名を表示し、既存の案件詳細へ遷移できるようにする。
- 予定詳細パネルにコメント欄を追加し、予定に紐づくコメントを同一画面で閲覧・投稿できるようにする。
- 週表示・月表示は予定の俯瞰を目的とし、各日から日表示へ移動できるようにする。
- 日表示でログインユーザー本人の日報を中央モーダルで作成・編集・下書き保存・提出できるようにする。
- 日報に紐づくコメントを同じ中央モーダル内で閲覧・投稿できるようにする。
- 日報提出時にLarkチャットへ提出通知を送信する。通知本文には日報本文を含めず、提出者・日付・確認URLのみ送る。
- Larkカレンダー同期はDBを正本にし、`sync_source`/`sync_status`/`last_synced_at`でループを防ぐ。
- app側で登録・編集・削除した予定は`/api/lark/calendar-sync`からLarkへ同期する。
- Lark側の変更は`/api/lark/events`のEvent Subscriptionで受け取り、`lark_calendar_id`/`lark_event_id`で既存予定へ突合する。

## 権限方針

既存の`users.role`は`admin`/`user`のみのため、Phase 1では以下で扱う。

- `admin`: 全社員の予定を閲覧・移動できる。
- `user`: 全社員の予定を閲覧できる。移動は自分が担当または作成した予定のみ。
- 予定の編集・削除は移動と同じく、`admin`は全予定、`user`は自分が担当または作成した予定のみ実行できる。
- 日報は本人または`admin`のみ閲覧・更新できる。Phase 1のUIではログインユーザー本人の日報を扱う。
- Lark同期Route Handlerは`LARK_SYNC_SECRET`またはLark Event Subscriptionのverify tokenで保護する。
- 閲覧専用ロールは既存DB制約変更が必要なため、後続フェーズで扱う。

## Lark設定

`.env.local`とVercel環境変数に以下を設定する。

- `LARK_OPEN_API_BASE_URL`: Larkは`https://open.larksuite.com`、Feishuは`https://open.feishu.cn`。
- `LARK_APP_ID`/`LARK_APP_SECRET`: tenant access token取得に使う。ブラウザへ露出させない。
- `LARK_CALENDAR_ID`: app管理の同期先カレンダーID。
- `LARK_SYNC_SECRET`: `/api/lark/calendar-sync`を呼ぶ内部ジョブ用secret。
- `LARK_EVENT_VERIFY_TOKEN`: Lark Event Subscriptionの検証token。
- `LARK_DAILY_REPORT_CHAT_ID`: 日報提出通知の送信先チャットID。
- `LARK_DAILY_REPORT_RECEIVE_ID_TYPE`: 既定は`chat_id`。

必要なLark権限:

- `im:message`: 日報提出通知を送信する。
- `calendar:calendar.event:create`
- `calendar:calendar.event:update`
- `calendar:calendar.event:delete`
- `calendar:calendar.event:read`

## 後続範囲

- ユーザーごとのLark主カレンダーID同期
- ユーザーアクセストークンを使う個人カレンダー同期
- Lark Event Subscription暗号化ペイロード対応
