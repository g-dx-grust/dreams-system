"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { type ActionResult, fail, ok } from "@/lib/result";
import { buildTransferContext } from "@/lib/transfer/context-builder";
import { fillDocx } from "@/lib/transfer/docx";
import { fillXlsx } from "@/lib/transfer/xlsx";
import { isDebugTemplateDescription } from "@/lib/templates/check-template";
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
    supabase
      .from("case_persons")
      .select("*")
      .eq("case_id", parsed.data.caseId)
      .order("sort_order"),
    supabase
      .from("case_parcels")
      .select("*")
      .eq("case_id", parsed.data.caseId)
      .order("sort_order"),
    supabase
      .from("case_financials")
      .select("*")
      .eq("case_id", parsed.data.caseId)
      .maybeSingle(),
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

  let outputBuf: Buffer;
  if (fileType === "docx") {
    outputBuf = fillDocx(templateBuf, ctx, parsed.data.highlight, mappings);
  } else {
    outputBuf = await fillXlsx(templateBuf, ctx, mappings, parsed.data.highlight);
  }

  const caseRow = caseRes.data as CaseRow;

  const previewData: Record<string, string> = {};
  const { resolvePath } = await import("@/lib/transfer/engine");
  for (const m of mappings) {
    previewData[m.fieldPath] = resolvePath(ctx, m.fieldPath);
  }

  for (let attempt = 0; attempt < DOCUMENT_SAVE_RETRIES; attempt += 1) {
    const version = await nextDocumentVersion(
      supabase,
      parsed.data.caseId,
      parsed.data.templateId,
    );
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
  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, case_type")
    .eq("id", parsed.data.caseId)
    .single();
  if (caseError || !caseRow) return fail("案件が見つかりませんでした。");

  const templatesResult = await listTemplateGenerationOptions(caseRow.case_type);
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

export type ListDocumentsParams = {
  caseId?: number;
  templateId?: number;
  page?: number;
  perPage?: number;
};

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

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return fail("帳票履歴の取得に失敗しました。");

  const items = (data ?? []).map((row) => ({
    ...(row as unknown as Omit<DocumentHistoryListRow, "case_number" | "template_name">),
    case_number: (row.cases as unknown as { case_number: string } | null)?.case_number ?? "",
    template_name: (row.templates as unknown as { name: string } | null)?.name ?? "",
  }));

  return ok({ items, total: count ?? 0, page, perPage });
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
