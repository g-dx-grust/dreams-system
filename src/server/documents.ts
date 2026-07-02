"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { type ActionResult, fail, ok } from "@/lib/result";
import { buildTransferContext } from "@/lib/transfer/context-builder";
import { fillDocx, TransferTagError } from "@/lib/transfer/docx";
import { fillXlsx } from "@/lib/transfer/xlsx";
import { formatMissingRequiredMessage, preCheck } from "@/lib/transfer/precheck";
import { isDebugTemplateDescription } from "@/lib/templates/check-template";
import { normalizeMunicipalityName } from "@/lib/normalize";
import { toTokyoDayStartIso, toTokyoNextDayStartIso } from "@/lib/date-time";
import {
  buildFileName,
  buildStorageCaseFolder,
  buildStorageFileName,
} from "@/lib/transfer/transfer-format";
import type { Mapping } from "@/lib/transfer/engine";
import { canonicalizeFieldPath } from "@/lib/transfer/field-dict";
import { listTemplateGenerationOptions, type TemplateMappingRow } from "./templates";
import type { CaseRow, CasePersonRow, CaseParcelRow, CaseFinancialRow } from "./cases";

// ---- 型定義 ----

export type DocumentHistoryRow = {
  id: number;
  case_id: number;
  template_id: number;
  version: number;
  file_name: string;
  file_path: string;
  file_type: string;
  transferred_data: Record<string, string> | null;
  highlight_enabled: boolean | null;
  generated_by_user_id: string | null;
  created_at: string;
};

export type DocumentHistoryListRow = Pick<
  DocumentHistoryRow,
  | "id"
  | "case_id"
  | "template_id"
  | "version"
  | "file_name"
  | "file_path"
  | "file_type"
  | "highlight_enabled"
  | "generated_by_user_id"
  | "created_at"
> & {
  case_number: string;
  template_name: string;
};

export type GeneratedDocumentResult = {
  id: number;
  fileName: string;
  fileType: string;
  version: number;
  downloadUrl: string;
};

export type BulkGenerateResult = {
  total: number;
  generated: GeneratedDocumentResult[];
  failed: Array<{
    templateId: number;
    templateName: string;
    error: string;
  }>;
  downloadUrl: string | null;
};

// ---- バリデーション ----

const GenerateSchema = z.object({
  caseId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  highlight: z.boolean().default(true),
});

const BulkGenerateSchema = z.object({
  caseId: z.number().int().positive(),
  templateIds: z.array(z.number().int().positive()).optional(),
  highlight: z.boolean().default(true),
});

const DOCUMENT_SAVE_RETRIES = 5;

// ---- 帳票生成 ----

export async function generateDocument(
  input: z.infer<typeof GenerateSchema>,
): Promise<ActionResult<GeneratedDocumentResult>> {
  const user = await requireUser();
  const parsed = GenerateSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }

  const supabase = await createClient();

  const [tmplRes, caseRes, personsRes, parcelsRes, financialRes] = await Promise.all([
    supabase
      .from("templates")
      .select("*, template_mappings(*)")
      .eq("id", parsed.data.templateId)
      .eq("is_active", true)
      .single(),
    supabase.from("cases").select("*").eq("id", parsed.data.caseId).single(),
    supabase.from("case_persons").select("*").eq("case_id", parsed.data.caseId).order("sort_order"),
    supabase.from("case_parcels").select("*").eq("case_id", parsed.data.caseId).order("sort_order"),
    supabase.from("case_financials").select("*").eq("case_id", parsed.data.caseId).maybeSingle(),
  ]);

  if (tmplRes.error || !tmplRes.data)
    return fail("テンプレートが見つかりませんでした。有効なテンプレートを選択してください。");
  if (caseRes.error || !caseRes.data) return fail("案件が見つかりませんでした。");

  const template = tmplRes.data;
  if (isDebugTemplateDescription(template.description)) {
    return fail(
      "動作確認用テンプレートは帳票生成に使えません。通常版テンプレートへ差し替えてください。",
    );
  }
  const fileType = template.file_type as "docx" | "xlsx";

  const municipalityCheck = await validateTemplateMunicipalityForCase(
    supabase,
    template.municipality_id as number | null,
    (parcelsRes.data ?? []) as CaseParcelRow[],
  );
  if (municipalityCheck) return fail(municipalityCheck);

  const storagePath = template.file_path.replace(/^templates\//, "");
  const { data: templateBlob, error: dlErr } = await supabase.storage
    .from("templates")
    .download(storagePath);
  if (dlErr || !templateBlob) return fail("テンプレートファイルの取得に失敗しました。");

  const templateBuf = await templateBlob.arrayBuffer();

  const ctx = buildTransferContext({
    caseRow: caseRes.data as CaseRow,
    casePersons: (personsRes.data ?? []) as CasePersonRow[],
    parcels: (parcelsRes.data ?? []) as CaseParcelRow[],
    financial: (financialRes.data ?? null) as CaseFinancialRow | null,
  });

  const rawMappings = (template.template_mappings ?? []) as TemplateMappingRow[];
  const mappings: Mapping[] = rawMappings.map((m) => ({
    placeholder: m.placeholder,
    fieldPath: canonicalizeFieldPath(m.field_path),
    label: m.label ?? undefined,
    isRequired: m.is_required ?? false,
  }));
  if (fileType === "xlsx" && mappings.length === 0) {
    return fail(
      "Excel テンプレートに転記マッピングが未設定です。テンプレート設定画面でセル座標を登録してください。",
    );
  }

  const checkResult = preCheck(ctx, mappings);
  if (checkResult.missingRequired.length > 0) {
    return fail(formatMissingRequiredMessage(checkResult.missingRequired));
  }

  let outputBuf: Buffer;
  try {
    if (fileType === "docx") {
      outputBuf = fillDocx(templateBuf, ctx, parsed.data.highlight, mappings);
    } else {
      outputBuf = await fillXlsx(templateBuf, ctx, mappings, parsed.data.highlight);
    }
  } catch (error) {
    console.error("document.generate transfer failed", {
      caseId: parsed.data.caseId,
      templateId: parsed.data.templateId,
      templateName: template.name,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof TransferTagError) {
      return fail(
        `テンプレート「${template.name}」の${error.message}。テンプレートの { } を確認してください。`,
      );
    }
    return fail(
      `テンプレート「${template.name}」の帳票生成に失敗しました。テンプレートファイルを確認してください。`,
    );
  }

  const caseRow = caseRes.data as CaseRow;

  const previewData = checkResult.previewData;

  for (let attempt = 0; attempt < DOCUMENT_SAVE_RETRIES; attempt += 1) {
    const version = await nextDocumentVersion(supabase, parsed.data.caseId, parsed.data.templateId);
    const fileName = buildFileName(caseRow.case_number, template.name, version, fileType);
    const storageFileName = buildStorageFileName(
      caseRow.case_number,
      Number(template.id),
      version,
      fileType,
    );
    const storageObjectPath = `${buildStorageCaseFolder(caseRow.case_number)}/${storageFileName}`;
    const filePath = `documents/${storageObjectPath}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storageObjectPath, outputBuf, {
        contentType:
          fileType === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (uploadErr) {
      if (isStorageConflict(uploadErr)) {
        await waitForRetry(attempt);
        continue;
      }
      console.error("document.generate upload failed", {
        caseId: parsed.data.caseId,
        templateId: parsed.data.templateId,
        filePath,
        message: uploadErr.message,
      });
      return fail("帳票ファイルの保存に失敗しました。再度お試しください。");
    }

    const { data: history, error: histErr } = await supabase
      .from("document_histories")
      .insert({
        case_id: parsed.data.caseId,
        template_id: parsed.data.templateId,
        version,
        file_name: fileName,
        file_path: filePath,
        file_type: fileType,
        transferred_data: previewData as unknown as import("@/types/database").Json,
        highlight_enabled: parsed.data.highlight,
        generated_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (histErr || !history) {
      await removeGeneratedDocument(storageObjectPath);
      if (histErr && isUniqueViolation(histErr)) {
        await waitForRetry(attempt);
        continue;
      }
      console.error("document.generate history insert failed", {
        caseId: parsed.data.caseId,
        templateId: parsed.data.templateId,
        filePath,
        message: histErr?.message,
      });
      return fail("帳票履歴の記録に失敗しました。");
    }

    await logAudit({
      userId: user.id,
      action: "document.generate",
      entityType: "document",
      entityId: history.id,
      detail: {
        caseId: parsed.data.caseId,
        templateId: parsed.data.templateId,
        version,
        fileName,
      },
    });

    revalidatePath("/documents");
    revalidatePath(`/cases/${parsed.data.caseId}/history`);
    revalidatePath(`/cases/${parsed.data.caseId}/documents`);

    return ok({
      id: history.id,
      fileName,
      fileType,
      version,
      downloadUrl: `/api/documents/${history.id}/download`,
    });
  }

  return fail("帳票の保存が競合しました。少し時間をおいて再度お試しください。");
}

export async function generateCaseDocuments(
  input: z.infer<typeof BulkGenerateSchema>,
): Promise<ActionResult<BulkGenerateResult>> {
  await requireUser();
  const parsed = BulkGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }

  const supabase = await createClient();
  const [caseRes, parcelsRes] = await Promise.all([
    supabase.from("cases").select("id, case_type").eq("id", parsed.data.caseId).single(),
    supabase.from("case_parcels").select("city").eq("case_id", parsed.data.caseId),
  ]);
  const { data: caseRow, error: caseError } = caseRes;
  if (caseError || !caseRow) return fail("案件が見つかりませんでした。");

  const templatesResult = await listTemplateGenerationOptions({
    caseType: caseRow.case_type,
    municipalityNames: ((parcelsRes.data ?? []) as Array<{ city: string | null }>).map(
      (parcel) => parcel.city ?? "",
    ),
  });
  if (!templatesResult.ok) return fail(templatesResult.error);

  const requestedIds = new Set(parsed.data.templateIds ?? []);
  const templates =
    requestedIds.size > 0
      ? templatesResult.data.filter((template) => requestedIds.has(template.id))
      : templatesResult.data;

  if (templates.length === 0) {
    return fail("この案件で一括出力できる有効なテンプレートがありません。");
  }

  const generated: GeneratedDocumentResult[] = [];
  const failed: BulkGenerateResult["failed"] = [];

  for (const template of templates) {
    const result = await generateDocument({
      caseId: parsed.data.caseId,
      templateId: template.id,
      highlight: parsed.data.highlight,
    });

    if (result.ok) {
      generated.push(result.data);
    } else {
      failed.push({
        templateId: template.id,
        templateName: template.name,
        error: result.error,
      });
    }
  }

  if (generated.length === 0) {
    const firstError = failed[0]?.error ?? "帳票生成に失敗しました。";
    return fail(`一括出力に失敗しました。${firstError}`);
  }

  const ids = generated.map((document) => document.id).join(",");

  return ok({
    total: templates.length,
    generated,
    failed,
    downloadUrl: `/api/cases/${parsed.data.caseId}/documents/download?ids=${ids}`,
  });
}

/*
 * 案件一覧からの一括帳票生成。選択した各案件について、その案件種別に適用される
 * 帳票をまとめて生成する（案件ごとに generateCaseDocuments を実行）。
 */
export async function bulkGenerateForCases(
  caseIds: number[],
  highlight = true,
): Promise<ActionResult<{ casesSucceeded: number; casesFailed: number; totalDocuments: number }>> {
  await requireUser();
  const targetIds = (caseIds ?? []).filter((v) => Number.isInteger(v) && v > 0);
  if (targetIds.length === 0) return fail("対象の案件が選択されていません。");

  let casesSucceeded = 0;
  let casesFailed = 0;
  let totalDocuments = 0;
  for (const caseId of targetIds) {
    const result = await generateCaseDocuments({ caseId, highlight });
    if (result.ok) {
      casesSucceeded += 1;
      totalDocuments += result.data.generated.length;
    } else {
      casesFailed += 1;
    }
  }

  if (casesSucceeded === 0) {
    return fail("選択した案件で生成できる帳票がありませんでした。");
  }
  return ok({ casesSucceeded, casesFailed, totalDocuments });
}

function isStorageConflict(error: { message?: string; statusCode?: number | string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    String(error.statusCode ?? "") === "409" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
}

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

async function waitForRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
}

async function removeGeneratedDocument(storageObjectPath: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from("documents").remove([storageObjectPath]);
  if (error) {
    console.error("[document.generate] cleanup failed", {
      path: storageObjectPath,
      message: error.message,
    });
  }
}

async function validateTemplateMunicipalityForCase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  municipalityId: number | null,
  parcels: CaseParcelRow[],
): Promise<string | null> {
  if (municipalityId === null) return null;

  const targetCities = new Set(
    parcels.map((parcel) => normalizeMunicipalityName(parcel.city)).filter(Boolean),
  );
  if (targetCities.size === 0) {
    return "対象土地の市区町村が未入力のため、この自治体専用テンプレートは生成できません。";
  }

  const { data, error } = await supabase
    .from("location_municipalities")
    .select("name")
    .eq("id", municipalityId)
    .maybeSingle();
  if (error || !data) return "テンプレートの地域設定を確認できませんでした。";

  return targetCities.has(normalizeMunicipalityName(data.name))
    ? null
    : "対象土地と一致しない自治体専用テンプレートのため、生成できません。";
}

async function nextDocumentVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: number,
  templateId: number,
): Promise<number> {
  const { data } = await supabase
    .from("document_histories")
    .select("version")
    .eq("case_id", caseId)
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

// ---- 帳票履歴一覧 ----

export type DocumentFileType = "docx" | "xlsx";

export type DocumentSortColumn = "created_at" | "version" | "file_name" | "case_number";

export type ListDocumentsParams = {
  caseId?: number;
  caseNumber?: string;
  templateId?: number;
  fileType?: DocumentFileType;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: string;
  page?: number;
  perPage?: number;
};

// PostgREST の or フィルタで使う値をエスケープする（"," や "(" を含む入力対策）。
function escapeFilterValue(value: string): string {
  return value.replace(/([(),."\\])/g, "\\$1");
}

export type DocumentTemplateOption = {
  id: number;
  name: string;
};

// 並べ替え可能なカラムの whitelist（インジェクション防止）。
// see: DESIGN.md §8.4「帳票履歴=生成日時の降順」を既定にする。
function resolveDocumentSort(
  sort: string | undefined,
  order: string | undefined,
): {
  column: DocumentSortColumn;
  ascending: boolean;
  // 結合テーブルのカラムでソートする場合に参照名を返す
  referencedTable?: string;
} {
  const ascending = order === "asc";
  switch (sort) {
    case "version":
      return { column: "version", ascending };
    case "file_name":
      return { column: "file_name", ascending };
    case "case_number":
      return { column: "case_number", ascending, referencedTable: "cases" };
    case "created_at":
      return { column: "created_at", ascending };
    default:
      // 未指定時は既定順（生成日時の降順）を維持する。
      return { column: "created_at", ascending: false };
  }
}

export async function listDocuments(params: ListDocumentsParams = {}): Promise<
  ActionResult<{
    items: DocumentHistoryListRow[];
    total: number;
    page: number;
    perPage: number;
  }>
> {
  await requireUser();
  const supabase = await createClient();

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(1, params.perPage ?? 20));

  let q = supabase
    .from("document_histories")
    .select(
      "id, case_id, template_id, version, file_name, file_path, file_type, highlight_enabled, generated_by_user_id, created_at, cases!inner(case_number), templates!inner(name)",
      { count: "exact" },
    );
  if (params.caseId) q = q.eq("case_id", params.caseId);
  if (params.templateId) q = q.eq("template_id", params.templateId);
  if (params.fileType === "docx" || params.fileType === "xlsx") {
    q = q.eq("file_type", params.fileType);
  }
  const caseNumber = params.caseNumber?.trim();
  if (caseNumber) {
    q = q.ilike("cases.case_number", `%${escapeFilterValue(caseNumber)}%`);
  }
  const keyword = params.q?.trim();
  if (keyword) {
    // ファイル名（テンプレート名・案件番号・版を含む命名規則）の部分一致で絞り込む。
    q = q.ilike("file_name", `%${escapeFilterValue(keyword)}%`);
  }
  const dateFromIso = toTokyoDayStartIso(params.dateFrom);
  const dateToIso = toTokyoNextDayStartIso(params.dateTo);
  if (dateFromIso) q = q.gte("created_at", dateFromIso);
  if (dateToIso) q = q.lt("created_at", dateToIso);

  const sort = resolveDocumentSort(params.sort, params.order);
  q = sort.referencedTable
    ? q.order(sort.column, { ascending: sort.ascending, referencedTable: sort.referencedTable })
    : q.order(sort.column, { ascending: sort.ascending });
  // 同一ソートキー内の表示順を安定させる。
  if (sort.column !== "created_at") {
    q = q.order("created_at", { ascending: false });
  }

  const { data, count, error } = await q.range((page - 1) * perPage, page * perPage - 1);

  if (error) return fail("帳票履歴の取得に失敗しました。");

  const items = (data ?? []).map((row) => ({
    ...(row as unknown as Omit<DocumentHistoryListRow, "case_number" | "template_name">),
    case_number: (row.cases as unknown as { case_number: string } | null)?.case_number ?? "",
    template_name: (row.templates as unknown as { name: string } | null)?.name ?? "",
  }));

  return ok({ items, total: count ?? 0, page, perPage });
}

/*
 * 帳票履歴フィルタのテンプレート絞り込み用に、履歴で実際に使われている
 * テンプレートのみを返す（生成実績のないテンプレートは候補に出さない）。
 */
export async function listDocumentTemplateOptions(): Promise<
  ActionResult<DocumentTemplateOption[]>
> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_histories")
    .select("template_id, templates!inner(name)")
    .order("template_id", { ascending: true });

  if (error) return fail("テンプレート候補の取得に失敗しました。");

  const seen = new Map<number, string>();
  for (const row of data ?? []) {
    const templateId = (row as { template_id: number }).template_id;
    if (seen.has(templateId)) continue;
    const name = (row.templates as unknown as { name: string } | null)?.name ?? "";
    seen.set(templateId, name);
  }

  const options = [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return ok(options);
}

// ---- 帳票履歴詳細 ----

export async function getDocument(id: number): Promise<ActionResult<DocumentHistoryRow>> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_histories")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return fail("帳票が見つかりませんでした。");
  return ok(data as DocumentHistoryRow);
}
