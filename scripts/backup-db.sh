#!/usr/bin/env bash
# see: docs/phase5/13_deployment.md §バックアップ
# 重要テーブルのデータのみダンプする。
# 使用前に SUPABASE_DB_URL 環境変数を設定すること。

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL を設定してください}"

BACKUP_DIR="backup"
mkdir -p "$BACKUP_DIR"

FILENAME="${BACKUP_DIR}/dreams_$(date +%Y%m%d_%H%M%S).sql"

pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --no-owner \
  --table=public.cases \
  --table=public.persons \
  --table=public.case_persons \
  --table=public.case_parcels \
  --table=public.case_financials \
  --table=public.templates \
  --table=public.template_mappings \
  --table=public.document_histories \
  --table=public.audit_logs \
  > "$FILENAME"

echo "バックアップ完了: $FILENAME"
