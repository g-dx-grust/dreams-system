-- ================================================================
-- 人マスタ重複候補検出関数
-- see: docs/phase2/05_persons_master.md §重複候補検出ロジック
-- ================================================================

CREATE OR REPLACE FUNCTION public.find_person_duplicates(
    p_query TEXT,
    p_threshold REAL DEFAULT 0.5
)
RETURNS TABLE (
    id INT,
    name VARCHAR,
    name_kana VARCHAR,
    address_pref VARCHAR,
    address_city VARCHAR,
    similarity REAL
) AS $$
    SELECT
        p.id,
        p.name,
        p.name_kana,
        p.address_pref,
        p.address_city,
        similarity(p.name_normalized, p_query) AS similarity
    FROM public.persons p
    WHERE p.name_normalized % p_query
      AND similarity(p.name_normalized, p_query) >= p_threshold
    ORDER BY similarity DESC
    LIMIT 10;
$$ LANGUAGE sql STABLE SECURITY INVOKER;
