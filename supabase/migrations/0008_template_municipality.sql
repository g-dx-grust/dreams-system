-- ================================================================
-- テンプレートの市町村分類
-- 1テンプレート = 0 または 1 市町村
-- ================================================================

ALTER TABLE public.templates
    ADD COLUMN municipality_id INTEGER
    REFERENCES public.location_municipalities(id) ON DELETE SET NULL;

CREATE INDEX idx_templates_municipality_id
    ON public.templates (municipality_id);

WITH inferred AS (
    SELECT
        t.id,
        CASE
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%豊橋%'
                THEN 'toyohashi_city'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%豊川%'
                THEN 'toyokawa_city'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%蒲郡%'
                THEN 'gamagori_city'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%新城%'
                THEN 'shinshiro_city'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%田原%'
                THEN 'tahara_city'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%設楽%'
                THEN 'shitara_town'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%東栄%'
                THEN 'toei_town'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%豊根%'
                THEN 'toyone_village'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%浜松%'
                THEN 'hamamatsu_city'
            WHEN concat_ws(' ', t.name, COALESCE(t.description, ''), COALESCE(t.original_file_name, '')) ILIKE '%湖西%'
                THEN 'kosai_city'
            ELSE NULL
        END AS municipality_code
    FROM public.templates AS t
)
UPDATE public.templates AS templates
SET municipality_id = municipalities.id
FROM inferred
JOIN public.location_municipalities AS municipalities
    ON municipalities.code = inferred.municipality_code
WHERE templates.id = inferred.id
  AND templates.municipality_id IS NULL
  AND inferred.municipality_code IS NOT NULL;
