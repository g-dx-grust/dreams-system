-- ================================================================
-- Larkテナント同期: usersにLark ID列を追加し、ログイン時メタデータと同期
-- see: docs/phase5/11_auth_permissions.md §Lark同期
-- ================================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS lark_open_id TEXT,
    ADD COLUMN IF NOT EXISTS lark_union_id TEXT,
    ADD COLUMN IF NOT EXISTS lark_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_lark_open_id_key
    ON public.users (lark_open_id)
    WHERE lark_open_id IS NOT NULL;

-- Larkログイン済みユーザーのopen_id/union_idをauthメタデータから引き継ぐ
UPDATE public.users AS u
SET
    lark_open_id = COALESCE(u.lark_open_id, NULLIF(au.raw_user_meta_data->>'lark_open_id', '')),
    lark_union_id = COALESCE(u.lark_union_id, NULLIF(au.raw_user_meta_data->>'lark_union_id', '')),
    updated_at = NOW()
FROM auth.users AS au
WHERE au.id = u.id
  AND (u.lark_open_id IS NULL OR u.lark_union_id IS NULL)
  AND (
      NULLIF(au.raw_user_meta_data->>'lark_open_id', '') IS NOT NULL
      OR NULLIF(au.raw_user_meta_data->>'lark_union_id', '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    metadata JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    synced_full_name TEXT;
    synced_avatar_url TEXT;
    synced_lark_open_id TEXT;
    synced_lark_union_id TEXT;
BEGIN
    synced_full_name := NULLIF(COALESCE(
        metadata->>'full_name',
        metadata->>'name',
        metadata->>'display_name',
        metadata->>'nickname',
        metadata->>'en_name'
    ), '');

    synced_avatar_url := NULLIF(COALESCE(
        metadata->>'avatar_url',
        metadata->>'picture',
        metadata->>'avatar',
        metadata->>'avatar_thumb',
        metadata->>'avatar_middle',
        metadata->>'avatar_big',
        metadata->>'image_url'
    ), '');

    synced_lark_open_id := NULLIF(metadata->>'lark_open_id', '');
    synced_lark_union_id := NULLIF(metadata->>'lark_union_id', '');

    INSERT INTO public.users (id, email, full_name, avatar_url, lark_open_id, lark_union_id)
    VALUES (NEW.id, NEW.email, synced_full_name, synced_avatar_url, synced_lark_open_id, synced_lark_union_id)
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        lark_open_id = COALESCE(EXCLUDED.lark_open_id, public.users.lark_open_id),
        lark_union_id = COALESCE(EXCLUDED.lark_union_id, public.users.lark_union_id),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
