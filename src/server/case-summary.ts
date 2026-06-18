import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/permissions";
import { type ActionResult, fail, ok } from "@/lib/result";
import type { CaseRow } from "@/server/cases";

// 案件サマリの単一取得。1 リクエストのレンダー内で複数回呼ばれても（レイアウト帯＋各タブ）
// DB 取得を 1 回に束ねるため React cache() でメモ化する。
//
// このモジュールは "use server" にしない：Server Actions モジュールは async 関数しか
// export できず、cache() でラップした値（async 関数そのものではない）を export すると
// Next の Server Actions 変換が共有アクションチャンクを壊し、全ルートの prerender が
// `a[d] is not a function` で落ちる。データ取得関数として分離し、Server Component から
// 直接 import して使う。see: src/server/cases.ts（mutation アクションは引き続き "use server"）
export const getCaseSummary = cache(
  async (id: number): Promise<ActionResult<CaseRow>> => {
    await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return fail("案件が見つかりませんでした。");
    return ok(data as CaseRow);
  },
);
