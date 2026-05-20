-- ================================================================
-- 様式カテゴリ マスタデータ
-- see: docs/phase1/02_db_schema.md §template_categories
-- ================================================================

INSERT INTO public.template_categories (name, slug, sort_order) VALUES
    ('土地改良区',     'land_improvement',    1),
    ('境界確定測量',   'boundary_survey',     2),
    ('建築許可',       'building_permit',     3),
    ('農地転用許可',   'farmland_conversion', 4)
ON CONFLICT (slug) DO NOTHING;
