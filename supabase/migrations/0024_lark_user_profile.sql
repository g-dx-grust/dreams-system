-- ================================================================
-- Lark OAuth profile metadata
-- see: docs/phase5/11_auth_permissions.md
-- ================================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    metadata JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    synced_full_name TEXT;
    synced_avatar_url TEXT;
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

    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (NEW.id, NEW.email, synced_full_name, synced_avatar_url)
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

UPDATE public.users AS u
SET
    full_name = COALESCE(
        NULLIF(u.full_name, ''),
        NULLIF(COALESCE(
            au.raw_user_meta_data->>'full_name',
            au.raw_user_meta_data->>'name',
            au.raw_user_meta_data->>'display_name',
            au.raw_user_meta_data->>'nickname',
            au.raw_user_meta_data->>'en_name'
        ), '')
    ),
    avatar_url = COALESCE(
        u.avatar_url,
        NULLIF(COALESCE(
            au.raw_user_meta_data->>'avatar_url',
            au.raw_user_meta_data->>'picture',
            au.raw_user_meta_data->>'avatar',
            au.raw_user_meta_data->>'avatar_thumb',
            au.raw_user_meta_data->>'avatar_middle',
            au.raw_user_meta_data->>'avatar_big',
            au.raw_user_meta_data->>'image_url'
        ), '')
    ),
    updated_at = NOW()
FROM auth.users AS au
WHERE au.id = u.id
  AND (
      (u.full_name IS NULL OR u.full_name = '')
      OR u.avatar_url IS NULL
  );
