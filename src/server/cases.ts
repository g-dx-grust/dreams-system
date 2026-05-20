"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  CaseCreateSchema,
  CaseUpdateSchema,
  CasePersonAddSchema,
  CasePersonUpdateSchema,
  CaseParcelSchema,
  CaseFinancialSchema,
  CASE_STATUSES,
  CASE_TYPES,
  type CaseCreateInput,
  type CaseUpdateInput,
  type CasePersonAddInput,
  type CasePersonUpdateInput,
  type CaseParcelInput,
  type CaseFinancialInput,
} from "@/lib/validators/case";
import { type ActionResult, fail, ok } from "@/lib/result";

export type CaseRow = {
  id: number;
  case_number: string;
  case_name: string;
  case_type: string;
  status: string;
  assigned_user_id: string | null;
  submission_target: string | null;
  submission_date: string | null;
  deadline_date: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type CasePersonRow = {
  id: number;
  case_id: number;
  person_id: number | null;
  role: string;
  sort_order: number;
  snapshot_name: string | null;
  snapshot_name_kana: string | null;
  snapshot_zip: string | null;
  snapshot_address_pref: string | null;
  snapshot_address_city: string | null;
  snapshot_address_town: string | null;
  snapshot_address_line1: string | null;
  snapshot_address_line2: string | null;
  snapshot_phone: string | null;
  snapshot_fax: string | null;
  snapshot_email: string | null;
  snapshot_corporate_number: string | null;
  snapshot_representative_name: string | null;
  snapshot_at: string | null;
  memo: string | null;
};

export type CaseParcelRow = {
  id: number;
  case_id: number;
  sort_order: number;
  pref: string | null;
  city: string | null;
  aza: string | null;
  chiban: string | null;
  chimoku: string | null;
  area: number | null;
  tenyo_area: number | null;
  memo: string | null;
};

export type CaseFinancialRow = {
  id: number;
  case_id: number;
  estimate_amount: number | null;
  invoice_amount: number | null;
  paid_amount: number | null;
  paid_date: string | null;
  tax_rate: number | null;
  memo: string | null;
};

export type CurrentMasterMap = Record<
  number,
  { name: string; updated_at: string } | undefined
>;

export type ListCasesParams = {
  q?: string;
  caseType?: string;
  status?: string;
  assignedUserId?: string;
  overdueOnly?: boolean;
  deadlineFrom?: string;
  deadlineTo?: string;
  page?: number;
  perPage?: number;
};

export async function listCases(params: ListCasesParams = {}): Promise<
  ActionResult<{ items: CaseRow[]; total: number; page: number; perPage: number }>
> {
  await requireUser();
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(1, params.perPage ?? 20));
  const caseType =
    params.caseType && (CASE_TYPES as readonly string[]).includes(params.caseType)
      ? params.caseType
      : null;
  const status =
    params.status && (CASE_STATUSES as readonly string[]).includes(params.status)
      ? params.status
      : null;

  const { data, error } = await supabase.rpc("list_cases_safe", {
    p_q: params.q?.trim() || null,
    p_case_type: caseType,
    p_status: status,
    p_assigned_user_id: params.assignedUserId || null,
    p_deadline_from: params.deadlineFrom || null,
    p_deadline_to: params.deadlineTo || null,
    p_overdue_only: params.overdueOnly ?? false,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  });

  if (error) return fail("取得に失敗しました。時間をおいて再度お試しください。");

  const rows = (data ?? []) as Array<CaseRow & { total_count?: number | string | null }>;
  const totalRaw = rows[0]?.total_count ?? 0;
  const total = typeof totalRaw === "string" ? Number(totalRaw) : totalRaw;
  const items = rows.map(({ total_count: _totalCount, ...row }) => row as CaseRow);

  return ok({ items, total: Number.isFinite(total) ? Number(total) : 0, page, perPage });
}

export const getCaseSummary = cache(async (id: number): Promise<ActionResult<CaseRow>> => {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return fail("案件が見つかりませんでした。");
  return ok(data as CaseRow);
});

export type CaseDetail = {
  case: CaseRow;
  persons: CasePersonRow[];
  parcels: CaseParcelRow[];
  financial: CaseFinancialRow | null;
  currentMasterByPersonId: CurrentMasterMap;
};

export async function getCaseDetail(id: number): Promise<ActionResult<CaseDetail>> {
  const caseRes = await getCaseSummary(id);
  if (!caseRes.ok) return fail(caseRes.error);

  const supabase = await createClient();

  const [personsRes, parcelsRes, financialRes] = await Promise.all([
    supabase
      .from("case_persons")
      .select("*")
      .eq("case_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("case_parcels")
      .select("*")
      .eq("case_id", id)
      .order("sort_order", { ascending: true }),
    supabase.from("case_financials").select("*").eq("case_id", id).maybeSingle(),
  ]);

  const persons = (personsRes.data ?? []) as CasePersonRow[];
  const masterIds = persons
    .map((p) => p.person_id)
    .filter((v): v is number => typeof v === "number");

  let currentMasterByPersonId: CurrentMasterMap = {};
  if (masterIds.length > 0) {
    const { data: masters } = await supabase
      .from("persons")
      .select("id, name, updated_at")
      .in("id", masterIds);
    currentMasterByPersonId = Object.fromEntries(
      (masters ?? []).map((m) => [m.id, { name: m.name, updated_at: m.updated_at }]),
    );
  }

  return ok({
    case: caseRes.data,
    persons,
    parcels: (parcelsRes.data ?? []) as CaseParcelRow[],
    financial: (financialRes.data ?? null) as CaseFinancialRow | null,
    currentMasterByPersonId,
  });
}

export async function getCasePersons(
  id: number,
): Promise<ActionResult<{ persons: CasePersonRow[]; currentMasterByPersonId: CurrentMasterMap }>> {
  const caseRes = await getCaseSummary(id);
  if (!caseRes.ok) return fail(caseRes.error);

  const supabase = await createClient();
  const { data: personsData, error } = await supabase
    .from("case_persons")
    .select("*")
    .eq("case_id", id)
    .order("sort_order", { ascending: true });

  if (error) return fail("関係者の取得に失敗しました。");

  const persons = (personsData ?? []) as CasePersonRow[];
  const masterIds = persons
    .map((p) => p.person_id)
    .filter((value): value is number => typeof value === "number");

  let currentMasterByPersonId: CurrentMasterMap = {};
  if (masterIds.length > 0) {
    const { data: masters, error: masterError } = await supabase
      .from("persons")
      .select("id, name, updated_at")
      .in("id", masterIds);

    if (masterError) return fail("関係者マスタの取得に失敗しました。");

    currentMasterByPersonId = Object.fromEntries(
      (masters ?? []).map((master) => [
        master.id,
        { name: master.name, updated_at: master.updated_at },
      ]),
    );
  }

  return ok({ persons, currentMasterByPersonId });
}

export async function getCaseParcels(id: number): Promise<ActionResult<CaseParcelRow[]>> {
  const caseRes = await getCaseSummary(id);
  if (!caseRes.ok) return fail(caseRes.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_parcels")
    .select("*")
    .eq("case_id", id)
    .order("sort_order", { ascending: true });

  if (error) return fail("土地情報の取得に失敗しました。");
  return ok((data ?? []) as CaseParcelRow[]);
}

export async function getCaseFinancial(id: number): Promise<ActionResult<CaseFinancialRow | null>> {
  const caseRes = await getCaseSummary(id);
  if (!caseRes.ok) return fail(caseRes.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_financials")
    .select("*")
    .eq("case_id", id)
    .maybeSingle();

  if (error) return fail("金額情報の取得に失敗しました。");
  return ok((data ?? null) as CaseFinancialRow | null);
}

export async function createCase(
  input: CaseCreateInput,
): Promise<ActionResult<{ id: number; case_number: string }>> {
  const user = await requireUser();
  const parsed = CaseCreateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "入力内容を確認してください", first?.path.join("."));
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_case_with_number", {
    p_case_name: parsed.data.case_name,
    p_case_type: parsed.data.case_type,
    p_assigned_user_id: parsed.data.assigned_user_id ?? null,
    p_submission_target: parsed.data.submission_target ?? null,
    p_submission_date: parsed.data.submission_date || null,
    p_deadline_date: parsed.data.deadline_date || null,
    p_memo: parsed.data.memo ?? null,
  });

  const created = Array.isArray(data) ? data[0] : data;
  if (error || !created) return fail("登録に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case.create",
    entityType: "case",
    entityId: created.id,
    detail: { after: parsed.data, case_number: created.case_number },
  });

  revalidatePath("/cases");
  return ok({ id: created.id, case_number: created.case_number });
}

export async function updateCase(
  id: number,
  input: CaseUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const parsed = CaseUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "入力内容を確認してください", first?.path.join("."));
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("cases").select("*").eq("id", id).single();
  if (!before) return fail("案件が見つかりませんでした。");

  const { error } = await supabase
    .from("cases")
    .update({
      case_name: parsed.data.case_name,
      case_type: parsed.data.case_type,
      status: parsed.data.status,
      assigned_user_id: parsed.data.assigned_user_id ?? null,
      submission_target: parsed.data.submission_target ?? null,
      submission_date: parsed.data.submission_date || null,
      deadline_date: parsed.data.deadline_date || null,
      memo: parsed.data.memo ?? null,
    })
    .eq("id", id);
  if (error) return fail("更新に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: id,
    detail: { before, after: parsed.data },
  });

  revalidatePath("/cases");
  revalidatePath(`/cases/${id}`);
  return ok({ id });
}

export async function deleteCase(id: number): Promise<ActionResult<{ id: number }>> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: before } = await supabase.from("cases").select("*").eq("id", id).single();
  if (!before) return fail("案件が見つかりませんでした。");

  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) return fail("削除に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case.delete",
    entityType: "case",
    entityId: id,
    detail: { before },
  });

  revalidatePath("/cases");
  return ok({ id });
}

// ================================================================
// 関係者（case_persons）
// ================================================================

export async function addCasePerson(
  caseId: number,
  input: CasePersonAddInput,
): Promise<
  ActionResult<{
    row: CasePersonRow;
    currentMaster: { name: string; updated_at: string };
  }>
> {
  const user = await requireUser();
  const parsed = CasePersonAddSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
  }

  const supabase = await createClient();
  const { data: master, error: masterErr } = await supabase
    .from("persons")
    .select("*")
    .eq("id", parsed.data.person_id)
    .single();
  if (masterErr || !master) return fail("関係者台帳の取得に失敗しました。");

  const { data, error } = await supabase
    .from("case_persons")
    .insert({
      case_id: caseId,
      person_id: master.id,
      role: parsed.data.role,
      sort_order: parsed.data.sort_order ?? 0,
      snapshot_name: master.name,
      snapshot_name_kana: master.name_kana,
      snapshot_zip: master.zip,
      snapshot_address_pref: master.address_pref,
      snapshot_address_city: master.address_city,
      snapshot_address_town: master.address_town,
      snapshot_address_line1: master.address_line1,
      snapshot_address_line2: master.address_line2,
      snapshot_phone: master.phone,
      snapshot_fax: master.fax,
      snapshot_email: master.email,
      snapshot_corporate_number: master.corporate_number,
      snapshot_representative_name: master.representative_name,
      snapshot_at: new Date().toISOString(),
      memo: parsed.data.memo ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return fail("関係者の追加に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case_person.add",
    entityType: "case_person",
    entityId: caseId,
    detail: { action: "addCasePerson", person_id: master.id, role: parsed.data.role },
  });

  revalidatePath(`/cases/${caseId}`);
  return ok({
    row: data as CasePersonRow,
    currentMaster: {
      name: master.name,
      updated_at: master.updated_at,
    },
  });
}

export async function updateCasePerson(
  casePersonId: number,
  input: CasePersonUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const parsed = CasePersonUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("case_persons")
    .select("*")
    .eq("id", casePersonId)
    .single();
  if (!before) return fail("関係者が見つかりませんでした。");

  const { error } = await supabase
    .from("case_persons")
    .update(parsed.data)
    .eq("id", casePersonId);
  if (error) return fail("更新に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: before.case_id,
    detail: { action: "updateCasePerson", casePersonId, after: parsed.data },
  });

  revalidatePath(`/cases/${before.case_id}`);
  return ok({ id: casePersonId });
}

export async function removeCasePerson(
  casePersonId: number,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("case_persons")
    .select("*")
    .eq("id", casePersonId)
    .single();
  if (!before) return fail("関係者が見つかりませんでした。");

  const { error } = await supabase.from("case_persons").delete().eq("id", casePersonId);
  if (error) return fail("削除に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case_person.remove",
    entityType: "case_person",
    entityId: before.case_id,
    detail: { action: "removeCasePerson", casePersonId },
  });

  revalidatePath(`/cases/${before.case_id}`);
  return ok({ id: casePersonId });
}

export async function resyncCasePerson(
  casePersonId: number,
): Promise<
  ActionResult<{
    row: CasePersonRow;
    currentMaster: { name: string; updated_at: string };
  }>
> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: cp } = await supabase
    .from("case_persons")
    .select("*")
    .eq("id", casePersonId)
    .single();
  if (!cp) return fail("関係者が見つかりませんでした。");
  if (!cp.person_id) return fail("元の関係者台帳データが削除されているため再同期できません。");

  const { data: master } = await supabase
    .from("persons")
    .select("*")
    .eq("id", cp.person_id)
    .single();
  if (!master) return fail("関係者台帳データが見つかりませんでした。");

  const { data, error } = await supabase
    .from("case_persons")
    .update({
      snapshot_name: master.name,
      snapshot_name_kana: master.name_kana,
      snapshot_zip: master.zip,
      snapshot_address_pref: master.address_pref,
      snapshot_address_city: master.address_city,
      snapshot_address_town: master.address_town,
      snapshot_address_line1: master.address_line1,
      snapshot_address_line2: master.address_line2,
      snapshot_phone: master.phone,
      snapshot_fax: master.fax,
      snapshot_email: master.email,
      snapshot_corporate_number: master.corporate_number,
      snapshot_representative_name: master.representative_name,
      snapshot_at: new Date().toISOString(),
    })
    .eq("id", casePersonId)
    .select("*")
    .single();
  if (error || !data) return fail("再同期に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case_person.resync",
    entityType: "case_person",
    entityId: cp.case_id,
    detail: { casePersonId, person_id: master.id },
  });

  revalidatePath(`/cases/${cp.case_id}`);
  return ok({
    row: data as CasePersonRow,
    currentMaster: {
      name: master.name,
      updated_at: master.updated_at,
    },
  });
}

// ================================================================
// 土地（case_parcels）
// ================================================================

export async function upsertCaseParcels(
  caseId: number,
  parcels: CaseParcelInput[],
): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  const validated: CaseParcelInput[] = [];
  for (const p of parcels) {
    const r = CaseParcelSchema.safeParse(p);
    if (!r.success) return fail(r.error.issues[0]?.message ?? "土地情報の入力内容を確認してください");
    validated.push(r.data);
  }

  const rows = validated.map((p, i) => ({
    sort_order: p.sort_order ?? i,
    pref: p.pref ?? null,
    city: p.city ?? null,
    aza: p.aza ?? null,
    chiban: p.chiban ?? null,
    chimoku: p.chimoku ?? null,
    area: p.area ?? null,
    tenyo_area: p.tenyo_area ?? null,
    memo: p.memo ?? null,
  }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_case_parcels", {
    p_case_id: caseId,
    p_rows: rows as unknown as import("@/types/database").Json,
  });
  if (error) return fail("土地情報の更新に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: caseId,
    detail: { action: "upsertCaseParcels", count: validated.length },
  });

  revalidatePath(`/cases/${caseId}`);
  return ok({ count: validated.length });
}

// ================================================================
// 金額（case_financials）
// ================================================================

export async function updateCaseFinancial(
  caseId: number,
  input: CaseFinancialInput,
): Promise<ActionResult<{ caseId: number }>> {
  const user = await requireUser();
  const parsed = CaseFinancialSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");

  const supabase = await createClient();
  const payload = {
    case_id: caseId,
    estimate_amount: parsed.data.estimate_amount ?? null,
    invoice_amount: parsed.data.invoice_amount ?? null,
    paid_amount: parsed.data.paid_amount ?? null,
    paid_date: parsed.data.paid_date || null,
    tax_rate: parsed.data.tax_rate,
    memo: parsed.data.memo ?? null,
  };

  const { error } = await supabase.from("case_financials").upsert(payload, { onConflict: "case_id" });
  if (error) return fail("金額情報の更新に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: caseId,
    detail: { action: "updateCaseFinancial", after: parsed.data },
  });

  revalidatePath(`/cases/${caseId}`);
  return ok({ caseId });
}

// ================================================================
// ユーザー一覧（担当者選択用）
// ================================================================

export type AssignableUser = { id: string; full_name: string | null; email: string };

export async function listAssignableUsers(): Promise<ActionResult<AssignableUser[]>> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) return fail("ユーザー一覧の取得に失敗しました。");
  return ok((data ?? []) as AssignableUser[]);
}
