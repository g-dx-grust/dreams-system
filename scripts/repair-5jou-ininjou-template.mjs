#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const STORAGE_BUCKET_TEMPLATES = "templates";
const TEMPLATE_NAME = "5条許可委任状";
const TEMPLATE_DEBUG_MARKER = "[toyohashi-mapping-check]";
const SOURCE_TEMPLATE_PATH = path.join(
  "docs",
  "様式",
  "農地転用許可",
  "5条許可委任状.docx",
);
const OUTPUT_DIR = path.join("tmp", "repair-5jou-ininjou");

function splitFieldPath(path) {
  return String(path).split(/\.|\[(\d+)\]/u).filter(Boolean);
}

function resolveRawPath(ctx, path) {
  let normalizedPath = String(path ?? "").trim();

  if (!normalizedPath) return undefined;
  if (normalizedPath === "." || normalizedPath === "this") return ctx;
  if (normalizedPath.startsWith("this.")) normalizedPath = normalizedPath.slice(5);
  if (normalizedPath.startsWith(".")) normalizedPath = normalizedPath.slice(1);
  if (!normalizedPath) return undefined;

  let current = ctx;

  for (const part of splitFieldPath(normalizedPath)) {
    if (current == null || typeof current !== "object") return undefined;
    current = /^\d+$/u.test(part) ? current[Number(part)] : current[part];
  }

  return current;
}

function createTransferParser(tag) {
  const normalizedTag = String(tag ?? "").trim();

  return {
    get(scope) {
      if (!normalizedTag) return undefined;
      if (normalizedTag === "." || normalizedTag === "this") return scope;
      return resolveRawPath(scope, normalizedTag);
    },
  };
}

function printUsage() {
  console.log(`Usage: node scripts/repair-5jou-ininjou-template.mjs [options]

Options:
  --apply                 Supabase のテンプレート新バージョンを実際に登録する
  --case-number <value>   検証用プレビューを出す案件番号（既定: 2026-FC-001）
  --help                  このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    caseNumber: "2026-FC-001",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--case-number") {
      options.caseNumber = argv[index + 1] ?? options.caseNumber;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function loadEnvFile(envPath) {
  let raw = "";

  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function stripDebugMarker(description) {
  return String(description ?? "")
    .replace(TEMPLATE_DEBUG_MARKER, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function replaceNth(source, search, replacement, occurrence) {
  let seen = 0;

  return source.replace(search, (match) => {
    seen += 1;
    return seen === occurrence ? replacement : match;
  });
}

function ensureChanged(before, after, label) {
  if (before === after) {
    throw new Error(`${label} の置換に失敗しました。テンプレート書式が想定と異なる可能性があります。`);
  }
}

function patchDocumentXml(xml) {
  let current = xml;

  const replacements = [
    [
      "　　豊橋市　　畑　　㎡",
      "　　{parcel.locationFull}　{parcel.chimoku}　{parcel.area}㎡",
      "申請地表示",
    ],
    ["令和　　年　　月　　日", "{today}", "日付"],
    [
      "　　譲受人　　住　　所　",
      "　　譲受人　　住　　所　{transferee.addressFull}",
      "譲受人住所",
    ],
    [
      "　　譲渡人　　住　　所　",
      "　　譲渡人　　住　　所　{transferor.addressFull}",
      "譲渡人住所",
    ],
  ];

  for (const [search, replacement, label] of replacements) {
    const next = current.replace(search, replacement);
    ensureChanged(current, next, label);
    current = next;
  }

  const transfereeName = replaceNth(
    current,
    /　　　　　　　氏　　名　/gu,
    "　　　　　　　氏　　名　{transferee.name}",
    1,
  );
  ensureChanged(current, transfereeName, "譲受人氏名");
  current = transfereeName;

  const transferorName = replaceNth(
    current,
    /　　　　　　　氏　　名　/gu,
    "　　　　　　　氏　　名　{transferor.name}",
    2,
  );
  ensureChanged(current, transferorName, "譲渡人氏名");
  current = transferorName;

  if (current.includes("【動作確認マッピング】")) {
    throw new Error("動作確認マッピングの残骸が含まれています。原本テンプレートを確認してください。");
  }

  return current;
}

function patchTemplateBuffer(buffer) {
  const zip = new PizZip(buffer);
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw new Error("word/document.xml が見つかりません。");
  }

  const patched = patchDocumentXml(documentXml.asText());
  zip.file("word/document.xml", patched);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function detectPlaceholders(buffer) {
  const zip = new PizZip(buffer);
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) return [];

  const plain = documentXml.asText().replace(/<[^>]+>/g, "");
  return Array.from(
    new Set(
      [...plain.matchAll(/\{([^{}#/^][^{}]*)\}/g)].map((match) => match[1]?.trim()).filter(Boolean),
    ),
  );
}

function formatZip(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 7);
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : String(raw || "");
}

function toWareki(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const eras = [
    { name: "令和", startYear: 2019, startMonth: 5, startDay: 1 },
    { name: "平成", startYear: 1989, startMonth: 1, startDay: 8 },
    { name: "昭和", startYear: 1926, startMonth: 12, startDay: 25 },
  ];

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  for (const era of eras) {
    const sameOrAfter =
      year > era.startYear ||
      (year === era.startYear && month > era.startMonth) ||
      (year === era.startYear && month === era.startMonth && day >= era.startDay);

    if (!sameOrAfter) continue;

    return `${era.name}${year - era.startYear + 1}年${month}月${day}日`;
  }

  return `${year}年${month}月${day}日`;
}

function buildPersonContext(casePerson) {
  const parts = [
    casePerson.snapshot_address_pref,
    casePerson.snapshot_address_city,
    casePerson.snapshot_address_town,
    casePerson.snapshot_address_line1,
    casePerson.snapshot_address_line2,
  ];

  return {
    name: casePerson.snapshot_name ?? "",
    nameKana: casePerson.snapshot_name_kana ?? "",
    zip: formatZip(casePerson.snapshot_zip ?? ""),
    addressPref: casePerson.snapshot_address_pref ?? "",
    addressCity: casePerson.snapshot_address_city ?? "",
    addressTown: casePerson.snapshot_address_town ?? "",
    addressLine1: casePerson.snapshot_address_line1 ?? "",
    addressLine2: casePerson.snapshot_address_line2 ?? "",
    addressFull: parts.filter(Boolean).join(""),
    addressNoPref: parts.slice(1).filter(Boolean).join(""),
    phone: casePerson.snapshot_phone ?? "",
    fax: casePerson.snapshot_fax ?? "",
    email: casePerson.snapshot_email ?? "",
    corporateNumber: casePerson.snapshot_corporate_number ?? "",
    representativeName: casePerson.snapshot_representative_name ?? "",
  };
}

function buildTransferContext(caseRow, casePersons, parcels) {
  const emptyPerson = {
    name: "",
    nameKana: "",
    zip: "",
    addressPref: "",
    addressCity: "",
    addressTown: "",
    addressLine1: "",
    addressLine2: "",
    addressFull: "",
    addressNoPref: "",
    phone: "",
    fax: "",
    email: "",
    corporateNumber: "",
    representativeName: "",
  };
  const emptyParcel = {
    pref: "",
    city: "",
    aza: "",
    chiban: "",
    locationFull: "",
    chimoku: "",
    area: "",
    tenyoArea: "",
  };

  const byRole = new Map();
  for (const casePerson of [...casePersons].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!byRole.has(casePerson.role)) {
      byRole.set(casePerson.role, buildPersonContext(casePerson));
    }
  }

  const firstParcel = [...parcels]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((parcel) => ({
      pref: parcel.pref ?? "",
      city: parcel.city ?? "",
      aza: parcel.aza ?? "",
      chiban: parcel.chiban ?? "",
      locationFull: [parcel.city, parcel.aza, parcel.chiban].filter(Boolean).join(""),
      chimoku: parcel.chimoku ?? "",
      area:
        parcel.area != null
          ? Number(parcel.area).toLocaleString("ja-JP", { minimumFractionDigits: 2 })
          : "",
      tenyoArea:
        parcel.tenyo_area != null
          ? Number(parcel.tenyo_area).toLocaleString("ja-JP", { minimumFractionDigits: 2 })
          : "",
    }))[0] ?? emptyParcel;

  return {
    today: toWareki(new Date()),
    transferee: byRole.get("transferee") ?? emptyPerson,
    transferor: byRole.get("transferor") ?? emptyPerson,
    parcel: firstParcel,
    caseNumber: caseRow.case_number,
  };
}

function renderDocx(buffer, context) {
  const doc = new Docxtemplater(new PizZip(buffer), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
    parser: createTransferParser,
  });
  doc.render(context);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

async function createSupabaseAdmin(projectRoot) {
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchTemplateForRepair(supabase) {
  const { data, error } = await supabase
    .from("templates")
    .select("*, template_categories(slug)")
    .eq("name", TEMPLATE_NAME)
    .order("version", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    throw new Error(`${TEMPLATE_NAME} のテンプレート取得に失敗しました: ${error?.message || "not found"}`);
  }

  const active = data.find((template) => template.is_active) ?? data[0];
  return { active, templates: data };
}

async function fetchCaseBundle(supabase, caseNumber) {
  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("case_number", caseNumber)
    .single();

  if (caseError || !caseRow) {
    throw new Error(`${caseNumber} の案件取得に失敗しました: ${caseError?.message || "not found"}`);
  }

  const [personsRes, parcelsRes] = await Promise.all([
    supabase.from("case_persons").select("*").eq("case_id", caseRow.id).order("sort_order"),
    supabase.from("case_parcels").select("*").eq("case_id", caseRow.id).order("sort_order"),
  ]);

  if (personsRes.error) {
    throw new Error(`case_persons の取得に失敗しました: ${personsRes.error.message}`);
  }
  if (parcelsRes.error) {
    throw new Error(`case_parcels の取得に失敗しました: ${parcelsRes.error.message}`);
  }

  return {
    caseRow,
    casePersons: personsRes.data ?? [],
    parcels: parcelsRes.data ?? [],
  };
}

async function writePreviewFiles(projectRoot, patchedBuffer, previewBuffer) {
  const outputDir = path.join(projectRoot, OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });

  const patchedPath = path.join(outputDir, "5jou-ininjou-patched-template.docx");
  const previewPath = path.join(outputDir, "5jou-ininjou-preview.docx");

  await fs.writeFile(patchedPath, patchedBuffer);
  await fs.writeFile(previewPath, previewBuffer);

  return {
    patchedPath,
    previewPath,
  };
}

async function applyTemplateVersion(supabase, template, patchedBuffer, placeholders) {
  const nextVersion = Number(template.version ?? 1) + 1;
  const categorySlug = template.template_categories?.slug;
  if (!categorySlug) {
    throw new Error("template_categories.slug が取得できませんでした。");
  }

  const cleanDescription = stripDebugMarker(template.description);
  const { data: inserted, error: insertError } = await supabase
    .from("templates")
    .insert({
      name: template.name,
      category_id: template.category_id,
      municipality_id: template.municipality_id,
      description: cleanDescription || null,
      file_type: template.file_type,
      file_path: "templates/_pending",
      original_file_name: template.original_file_name,
      version: nextVersion,
      is_active: true,
      applicable_case_types: template.applicable_case_types,
      uploaded_by_user_id: template.uploaded_by_user_id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`新バージョン登録に失敗しました: ${insertError?.message || "unknown"}`);
  }

  const storagePath = `${categorySlug}/${inserted.id}_v${nextVersion}.docx`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET_TEMPLATES)
    .upload(storagePath, patchedBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });

  if (uploadError) {
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`テンプレートアップロードに失敗しました: ${uploadError.message}`);
  }

  const { error: updatePathError } = await supabase
    .from("templates")
    .update({ file_path: `templates/${storagePath}` })
    .eq("id", inserted.id);

  if (updatePathError) {
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([storagePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`file_path 更新に失敗しました: ${updatePathError.message}`);
  }

  const { error: mappingsError } = await supabase.from("template_mappings").insert(
    placeholders.map((placeholder, index) => ({
      template_id: inserted.id,
      placeholder,
      field_path: placeholder,
      label: placeholder,
      is_required: false,
      sort_order: index,
    })),
  );

  if (mappingsError) {
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([storagePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`template_mappings 登録に失敗しました: ${mappingsError.message}`);
  }

  const { error: deactivateError } = await supabase
    .from("templates")
    .update({ is_active: false })
    .eq("id", template.id);
  if (deactivateError) {
    throw new Error(`旧テンプレートの無効化に失敗しました: ${deactivateError.message}`);
  }

  return {
    id: inserted.id,
    version: nextVersion,
    storagePath: `templates/${storagePath}`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const supabase = await createSupabaseAdmin(projectRoot);

  const sourceBuffer = await fs.readFile(path.join(projectRoot, SOURCE_TEMPLATE_PATH));
  const patchedBuffer = patchTemplateBuffer(sourceBuffer);
  const placeholders = detectPlaceholders(patchedBuffer);

  const caseBundle = await fetchCaseBundle(supabase, options.caseNumber);
  const previewBuffer = renderDocx(
    patchedBuffer,
    buildTransferContext(caseBundle.caseRow, caseBundle.casePersons, caseBundle.parcels),
  );
  const { patchedPath, previewPath } = await writePreviewFiles(
    projectRoot,
    patchedBuffer,
    previewBuffer,
  );

  console.log("Repair preview created.");
  console.log(`  template: ${path.relative(projectRoot, patchedPath)}`);
  console.log(`  preview:  ${path.relative(projectRoot, previewPath)}`);
  console.log(`  fields:   ${placeholders.join(", ")}`);

  if (!options.apply) {
    console.log("");
    console.log("Dry-run only. Add --apply to register this as a new Supabase template version.");
    return;
  }

  const { active } = await fetchTemplateForRepair(supabase);
  const result = await applyTemplateVersion(supabase, active, patchedBuffer, placeholders);

  console.log("");
  console.log("Supabase template updated.");
  console.log(`  previous_template_id: ${active.id}`);
  console.log(`  new_template_id:      ${result.id}`);
  console.log(`  version:              v${result.version}`);
  console.log(`  file_path:            ${result.storagePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
