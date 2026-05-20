-- ================================================================
-- Storage bucket & RLS
-- see: docs/phase1/02_db_schema.md § Supabase Storage 構成
--   templates  — 認証済みのみ閲覧、書き込みは admin
--   documents  — 認証済みのみ閲覧・書き込み
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('templates', 'templates', FALSE),
    ('documents', 'documents', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ---- templates bucket ----
DROP POLICY IF EXISTS "templates_select" ON storage.objects;
DROP POLICY IF EXISTS "templates_write"  ON storage.objects;

CREATE POLICY "templates_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'templates' AND public.is_active_user());

CREATE POLICY "templates_write" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'templates' AND public.is_admin())
    WITH CHECK (bucket_id = 'templates' AND public.is_admin());

-- ---- documents bucket ----
DROP POLICY IF EXISTS "documents_select" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert" ON storage.objects;

CREATE POLICY "documents_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'documents' AND public.is_active_user());

CREATE POLICY "documents_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'documents' AND public.is_active_user());

-- UPDATE / DELETE は admin のみ（履歴の不変性に揃える運用判断）
-- see: docs/phase1/02_db_schema.md § document_histories の UPDATE/DELETE 禁止方針
DROP POLICY IF EXISTS "documents_admin_modify" ON storage.objects;
CREATE POLICY "documents_admin_modify" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'documents' AND public.is_admin());

DROP POLICY IF EXISTS "documents_admin_delete" ON storage.objects;
CREATE POLICY "documents_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'documents' AND public.is_admin());
