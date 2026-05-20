-- ================================================================
-- case_persons snapshot 補完
-- 帳票転記で必要な FAX / 法人情報を案件スナップショットにも保持する
-- ================================================================

ALTER TABLE public.case_persons
  ADD COLUMN IF NOT EXISTS snapshot_fax VARCHAR(30),
  ADD COLUMN IF NOT EXISTS snapshot_corporate_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS snapshot_representative_name VARCHAR(200);
