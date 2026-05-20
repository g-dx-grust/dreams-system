-- ================================================================
-- エリア / 都道府県 / 市町村 マスタ
-- 階層: area > prefecture > municipality
-- ================================================================

CREATE TABLE public.location_areas (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    code          VARCHAR(50) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.location_prefectures (
    id            SERIAL PRIMARY KEY,
    area_id       INTEGER NOT NULL REFERENCES public.location_areas(id) ON DELETE CASCADE,
    name          VARCHAR(20) NOT NULL,
    code          VARCHAR(50) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT location_prefectures_area_id_name_key UNIQUE (area_id, name)
);

CREATE TABLE public.location_municipalities (
    id            SERIAL PRIMARY KEY,
    prefecture_id INTEGER NOT NULL REFERENCES public.location_prefectures(id) ON DELETE CASCADE,
    name          VARCHAR(50) NOT NULL,
    code          VARCHAR(50) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT location_municipalities_prefecture_id_name_key UNIQUE (prefecture_id, name)
);

CREATE INDEX idx_location_prefectures_area_id
    ON public.location_prefectures (area_id, display_order, id);

CREATE INDEX idx_location_municipalities_prefecture_id
    ON public.location_municipalities (prefecture_id, display_order, id);

-- ---- RLS ----
ALTER TABLE public.location_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_prefectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_municipalities ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_areas_select ON public.location_areas
    FOR SELECT USING (public.is_active_user());

CREATE POLICY location_areas_write ON public.location_areas
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY location_prefectures_select ON public.location_prefectures
    FOR SELECT USING (public.is_active_user());

CREATE POLICY location_prefectures_write ON public.location_prefectures
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY location_municipalities_select ON public.location_municipalities
    FOR SELECT USING (public.is_active_user());

CREATE POLICY location_municipalities_write ON public.location_municipalities
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- Seed ----
INSERT INTO public.location_areas (name, code, display_order) VALUES
    ('東三河エリア', 'east_mikawa', 1),
    ('浜松・湖西エリア', 'hamamatsu_kosai', 2)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;

INSERT INTO public.location_prefectures (area_id, name, code, display_order)
SELECT areas.id, values_table.name, values_table.code, values_table.display_order
FROM (
    VALUES
        ('east_mikawa', '愛知県', 'aichi', 1),
        ('hamamatsu_kosai', '静岡県', 'shizuoka', 1)
) AS values_table(area_code, name, code, display_order)
JOIN public.location_areas AS areas
    ON areas.code = values_table.area_code
ON CONFLICT (code) DO UPDATE SET
    area_id = EXCLUDED.area_id,
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;

INSERT INTO public.location_municipalities (prefecture_id, name, code, display_order)
SELECT prefectures.id, values_table.name, values_table.code, values_table.display_order
FROM (
    VALUES
        ('aichi', '豊橋市', 'toyohashi_city', 1),
        ('aichi', '豊川市', 'toyokawa_city', 2),
        ('aichi', '蒲郡市', 'gamagori_city', 3),
        ('aichi', '新城市', 'shinshiro_city', 4),
        ('aichi', '田原市', 'tahara_city', 5),
        ('aichi', '設楽町', 'shitara_town', 6),
        ('aichi', '東栄町', 'toei_town', 7),
        ('aichi', '豊根村', 'toyone_village', 8),
        ('shizuoka', '浜松市', 'hamamatsu_city', 1),
        ('shizuoka', '湖西市', 'kosai_city', 2)
) AS values_table(prefecture_code, name, code, display_order)
JOIN public.location_prefectures AS prefectures
    ON prefectures.code = values_table.prefecture_code
ON CONFLICT (code) DO UPDATE SET
    prefecture_id = EXCLUDED.prefecture_id,
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;
