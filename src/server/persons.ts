"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { normalizeName, normalizeZip, normalizePhone } from "@/lib/normalize";
import { PersonUpsertSchema, type PersonUpsertInput } from "@/lib/validators/person";
import type { CasePersonRole } from "@/lib/validators/case";
import { type ActionResult, fail, ok } from "@/lib/result";

export type PersonRow = {
  id: number;
  person_type: "individual" | "corporation";
  default_case_role: CasePersonRole | null;
  name: string;
  name_kana: string | null;
  zip: string | null;
  address_pref: string | null;
  address_city: string | null;
  address_town: string | null;
  address_line1: string | null;
  address_line2: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  corporate_number: string | null;
  representative_name: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type ListPersonsParams = {
  q?: string;
  personType?: "individual" | "corporation";
  sort?: string;
  order?: string;
  page?: number;
  perPage?: number;
};

export async function listPersons(params: ListPersonsParams = {}): Promise<
  ActionResult<{ items: PersonRow[]; total: number; page: number; perPage: number }>
> {
  await requireUser();
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(1, params.perPage ?? 20));

  const personSortKeys = ["person_type", "name", "name_kana", "role", "updated"] as const;
  const sortKey =
    params.sort && (personSortKeys as readonly string[]).includes(params.sort) ? params.sort : null;
  const sortOrder = params.order === "desc" ? "desc" : "asc";

  // p_sort/p_order はソート指定時のみ渡す。マイグレーション 0015 未適用でも
  // 既定一覧（ソートなし）は旧シグネチャで動作し続ける。
  const rpcArgs = {
    p_q: params.q?.trim() || null,
    p_person_type: params.personType ?? null,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
    ...(sortKey ? { p_sort: sortKey, p_order: sortOrder } : {}),
  };

  const { data, error } = await supabase.rpc("list_persons_safe", rpcArgs);
  if (error) return fail("取得に失敗しました。時間をおいて再度お試しください。");

  const rows = (data ?? []) as Array<PersonRow & { total_count?: number | string | null }>;
  const totalRaw = rows[0]?.total_count ?? 0;
  const total = typeof totalRaw === "string" ? Number(totalRaw) : totalRaw;
  const items = rows.map(({ total_count: _totalCount, ...row }) => row as PersonRow);

  return ok({ items, total: Number.isFinite(total) ? Number(total) : 0, page, perPage });
}

export async function getPerson(id: number): Promise<ActionResult<PersonRow>> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("persons").select("*").eq("id", id).single();
  if (error || !data) return fail("該当する人物が見つかりませんでした。");
  return ok(data as PersonRow);
}

function sanitize(input: PersonUpsertInput) {
  return {
    person_type: input.person_type,
    default_case_role: input.default_case_role || null,
    name: input.name.trim(),
    name_kana: input.name_kana?.trim() || null,
    zip: input.zip ? normalizeZip(input.zip) : null,
    address_pref: input.address_pref?.trim() || null,
    address_city: input.address_city?.trim() || null,
    address_town: input.address_town?.trim() || null,
    address_line1: input.address_line1?.trim() || null,
    address_line2: input.address_line2?.trim() || null,
    phone: input.phone ? normalizePhone(input.phone) : null,
    fax: input.fax ? normalizePhone(input.fax) : null,
    email: input.email?.trim() || null,
    corporate_number: input.corporate_number?.trim() || null,
    representative_name: input.representative_name?.trim() || null,
    memo: input.memo?.trim() || null,
    name_normalized: normalizeName(input.name),
  };
}

export async function createPerson(
  input: PersonUpsertInput,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const parsed = PersonUpsertSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "入力内容を確認してください", first?.path.join("."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("persons")
    .insert(sanitize(parsed.data))
    .select("id")
    .single();

  if (error || !data) return fail("登録に失敗しました。時間をおいて再度お試しください。");

  await logAudit({
    userId: user.id,
    action: "person.create",
    entityType: "person",
    entityId: data.id,
    detail: { after: parsed.data },
  });

  revalidatePath("/persons");
  return ok({ id: data.id });
}

export async function updatePerson(
  id: number,
  input: PersonUpsertInput,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const parsed = PersonUpsertSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "入力内容を確認してください", first?.path.join("."));
  }

  const supabase = await createClient();

  const { data: before } = await supabase.from("persons").select("*").eq("id", id).single();
  if (!before) return fail("該当する人物が見つかりませんでした。");

  const { error } = await supabase.from("persons").update(sanitize(parsed.data)).eq("id", id);
  if (error) return fail("更新に失敗しました。時間をおいて再度お試しください。");

  await logAudit({
    userId: user.id,
    action: "person.update",
    entityType: "person",
    entityId: id,
    detail: { before, after: parsed.data },
  });

  revalidatePath("/persons");
  revalidatePath(`/persons/${id}`);
  return ok({ id });
}

export async function deletePerson(id: number): Promise<ActionResult<{ id: number }>> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { count: linkedCount } = await supabase
    .from("case_persons")
    .select("id", { count: "exact", head: true })
    .eq("person_id", id);
  if ((linkedCount ?? 0) > 0) {
    return fail(
      "この人物は案件に紐付いています。削除すると案件側のスナップショットは残ります。",
    );
  }

  const { data: before } = await supabase.from("persons").select("*").eq("id", id).single();
  if (!before) return fail("該当する人物が見つかりませんでした。");

  const { error } = await supabase.from("persons").delete().eq("id", id);
  if (error) return fail("削除に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "person.delete",
    entityType: "person",
    entityId: id,
    detail: { before },
  });

  revalidatePath("/persons");
  return ok({ id });
}

export type DuplicateCandidate = {
  id: number;
  name: string;
  name_kana: string | null;
  address_pref: string | null;
  address_city: string | null;
  similarity: number;
};

export async function findDuplicates(query: string): Promise<ActionResult<DuplicateCandidate[]>> {
  await requireUser();
  if (!query.trim()) return ok([]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_person_duplicates", {
    p_query: normalizeName(query),
    p_threshold: 0.5,
  });
  if (error) return fail("重複候補の取得に失敗しました。");
  return ok((data ?? []) as DuplicateCandidate[]);
}
