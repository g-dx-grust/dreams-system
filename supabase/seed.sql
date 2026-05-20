-- ================================================================
-- 初期データ投入
-- see: docs/phase1/02_db_schema.md
-- ================================================================

-- ---- 様式カテゴリ ----
INSERT INTO public.template_categories (name, slug, sort_order) VALUES
    ('土地改良区',     'land_improvement',    1),
    ('境界確定測量',   'boundary_survey',     2),
    ('建築許可',       'building_permit',     3),
    ('農地転用許可',   'farmland_conversion', 4)
ON CONFLICT (slug) DO NOTHING;

-- ---- エリア / 都道府県 / 市町村 マスタ ----
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
