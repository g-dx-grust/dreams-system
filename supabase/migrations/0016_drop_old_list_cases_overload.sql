-- 0014 は CREATE OR REPLACE で引数を 9→11 に増やしたため、旧 9 引数版が残り
-- list_cases_safe が 2 つ（9引数 / 11引数）になってしまった。
-- 既定一覧（ソートなし=9引数相当）呼び出しで "function is not unique" になり得るため、
-- 旧 9 引数オーバーロードを削除し、11 引数版（p_sort/p_order は DEFAULT NULL）に一本化する。
-- 11 引数版は p_sort/p_order を省略しても既定順で動作するため、全呼び出しを賄える。
-- see: docs/uiux-redesign-plan.md フェーズ3

DROP FUNCTION IF EXISTS public.list_cases_safe(
    TEXT, TEXT, TEXT, UUID, DATE, DATE, BOOLEAN, INTEGER, INTEGER
);
