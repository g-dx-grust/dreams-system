-- ================================================================
-- 既存テンプレートマッピングの「大字・字」結合参照を維持する移行
-- - 大字・字 分割（0011）に伴い field_path "...aza" は「字」のみを指すようになった
-- - 旧来の結合表示を保つため、末尾 ".aza" を結合フィールド ".oazaAza" に寄せる
-- - 対象: parcel.aza / parcels[n].aza（末尾が ".aza" のもの）
-- - ".oaza"（大字）は対象外。冪等（再実行しても末尾 ".aza" は残らない）
-- see: 修正メモ20260520.md（大字と字の分割機能）
-- ================================================================

UPDATE public.template_mappings
SET field_path = LEFT(field_path, LENGTH(field_path) - 4) || '.oazaAza'
WHERE field_path LIKE '%.aza';
