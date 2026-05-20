#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const TEMPLATE_DEBUG_MARKER = "[toyohashi-mapping-check]";
const OUTPUT_DIR = path.join("tmp", "repair-xlsx-templates");

const TEMPLATE_CONFIGS = [
  {
    key: "land-improvement-membership",
    name: "10組合員資格得喪通知書様式（豊川総合用水土地改良区）",
    caseNumber: "2026-LI-001",
    mappings: [
      ["AF7", "today"],
      ["O11", "transferor.addressFull"],
      ["O12", "transferor.nameKana"],
      ["O13", "transferor.name"],
      ["O15", "transferee.addressFull"],
      ["O16", "transferee.nameKana"],
      ["O17", "transferee.name"],
      ["O21", "transferee.phone"],
      ["A33", "parcels[0].city"],
      ["F33", "parcels[0].aza"],
      ["Q33", "parcels[0].chiban"],
      ["U33", "parcels[0].chimoku"],
      ["AA33", "parcels[0].area"],
      ["AF33", "today"],
      ["A34", "parcels[1].city"],
      ["F34", "parcels[1].aza"],
      ["Q34", "parcels[1].chiban"],
      ["U34", "parcels[1].chimoku"],
      ["AA34", "parcels[1].area"],
      ["AF34", "today"],
    ],
  },
  {
    key: "land-improvement-restore",
    name: "受益地復帰願（参考様式）（豊川総合用水土地改良区）",
    caseNumber: "2026-LI-001",
    mappings: [
      ["A3", "today"],
      ["I7", "applicant.name"],
      ["I8", "applicant.addressFull"],
      ["I10", "transferee.addressFull"],
      ["I11", "transferee.name"],
      ["I18", "parcel.city"],
      ["C20", "parcel.aza"],
      ["E20", "parcel.chiban"],
      ["F20", "parcel.chimoku"],
      ["G20", "parcel.area"],
      ["H20", "parcel.tenyoArea"],
    ],
  },
  {
    key: "building-permit-site-survey",
    name: "現地調査（事前審査）依頼票",
    caseNumber: "2026-BP-001",
    mappings: [
      ["Z7", "today"],
      ["W10", "agent.addressFull"],
      ["W12", "agent.name"],
      ["W14", "agent.phone"],
      ["G18", "parcel.locationFull"],
      ["I21", "parcel.chimoku"],
      ["X21", "totalTenyoArea"],
      ["G27", "transferor.addressFull"],
      ["G28", "transferor.name"],
      ["G32", "applicant.addressFull"],
      ["G33", "applicant.name"],
    ],
  },
  {
    key: "building-permit-owned-land",
    name: "所有地一覧",
    caseNumber: "2026-BP-001",
    mappings: Array.from({ length: 13 }, (_, index) => {
      const row = 6 + index * 2;
      return [
        [`C${row}`, `parcels[${index}].aza`],
        [`D${row}`, `parcels[${index}].chiban`],
        [`E${row}`, `parcels[${index}].chimoku`],
        [`F${row}`, `parcels[${index}].area`],
      ];
    }).flat(),
  },
  {
    key: "boundary-survey-book",
    name: "豊橋市R3様式集",
    caseNumber: "2026-BS-001",
    mappings: [
      ["1!T9", "applicant.addressFull"],
      ["1!T10", "applicant.name"],
      ["1!T11", "applicant.phone"],
      ["1!T12", "agent.addressFull"],
      ["1!T13", "agent.name"],
      ["1!T14", "agent.phone"],
      ["1!V23", "parcel.chimoku"],
      ["1!AA23", "parcel.area"],
      ["1-2!T9", "applicant.addressFull"],
      ["1-2!T10", "applicant.name"],
      ["1-2!T11", "applicant.phone"],
      ["1-2!T12", "agent.addressFull"],
      ["1-2!T13", "agent.name"],
      ["1-2!T14", "agent.phone"],
      ["1-2!V23", "parcel.chimoku"],
      ["1-2!AA23", "parcel.area"],
      ["2!A8", "parcels[0].chiban"],
      ["2!B8", "parcels[0].chimoku"],
      ["2!D8", "parcels[0].area"],
      ["2!F8", "transferor.addressFull"],
      ["2!F9", "transferor.name"],
      ["2!A11", "parcels[1].chiban"],
      ["2!B11", "parcels[1].chimoku"],
      ["2!D11", "parcels[1].area"],
      ["2!F11", "transferor.addressFull"],
      ["2!F12", "transferor.name"],
      ["3!G6", "applicant.addressFull"],
      ["3!G7", "applicant.name"],
      ["3!G9", "agent.addressFull"],
      ["3!G10", "agent.name"],
      ["3!G11", "agent.phone"],
      ["3!D18", "parcel.city"],
    ],
  },
];

function printUsage() {
  console.log(`Usage: node scripts/repair-xlsx-templates.mjs [options]

Options:
  --apply                    Supabase のテンプレートマッピングと有効状態を更新する
  --templates <keys>         対象テンプレート key をカンマ区切りで指定
  --help                     このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    templateKeys: new Set(TEMPLATE_CONFIGS.map((config) => config.key)),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--templates") {
      const value = argv[index + 1] ?? "";
      options.templateKeys = new Set(
        value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
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
  const applicants = [];
  const neighbors = [];

  for (const casePerson of [...casePersons].sort((a, b) => a.sort_order - b.sort_order)) {
    const person = buildPersonContext(casePerson);
    if (!byRole.has(casePerson.role)) byRole.set(casePerson.role, person);
    if (casePerson.role === "applicant") applicants.push(person);
    if (casePerson.role === "neighbor") neighbors.push(person);
  }

  const parcelContexts = [...parcels]
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
    }));

  const totalArea = [...parcels].reduce((sum, parcel) => sum + Number(parcel.area ?? 0), 0);
  const totalTenyoArea = [...parcels].reduce(
    (sum, parcel) => sum + Number(parcel.tenyo_area ?? 0),
    0,
  );

  return {
    caseNumber: caseRow.case_number ?? "",
    caseName: caseRow.case_name ?? "",
    caseTypeLabel: caseRow.case_type ?? "",
    submissionTarget: caseRow.submission_target ?? "",
    submissionDate: caseRow.submission_date ? toWareki(new Date(caseRow.submission_date)) : "",
    deadlineDate: caseRow.deadline_date ? toWareki(new Date(caseRow.deadline_date)) : "",
    today: toWareki(new Date()),
    todayYear: `令和${new Date().getFullYear() - 2018}年`,
    todayMonth: String(new Date().getMonth() + 1),
    todayDay: String(new Date().getDate()),
    applicant: byRole.get("applicant") ?? emptyPerson,
    transferee: byRole.get("transferee") ?? emptyPerson,
    transferor: byRole.get("transferor") ?? emptyPerson,
    agent: byRole.get("agent") ?? emptyPerson,
    billing: byRole.get("billing") ?? emptyPerson,
    neighbor: byRole.get("neighbor") ?? emptyPerson,
    applicants,
    neighbors,
    parcels: parcelContexts,
    parcel: parcelContexts[0] ?? emptyParcel,
    totalArea: totalArea
      ? totalArea.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    totalTenyoArea: totalTenyoArea
      ? totalTenyoArea.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    estimateAmount: "",
    estimateAmountTax: "",
    estimateAmountTotal: "",
    invoiceAmount: "",
    invoiceAmountTax: "",
    invoiceAmountTotal: "",
  };
}

function resolvePath(ctx, path) {
  const parts = String(path).split(/\.|\[(\d+)\]/u).filter(Boolean);
  let current = ctx;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = /^\d+$/u.test(part) ? current[Number(part)] : current[part];
  }

  return current == null ? "" : String(current);
}

function normalizeSheetName(raw) {
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parsePlaceholder(raw, workbook) {
  const direct = String(raw).match(/^([^!]+)!(.+)$/u);
  if (direct && direct[1] && direct[2]) {
    return { sheetName: normalizeSheetName(direct[1]), cellRef: direct[2] };
  }

  const ranges = workbook.definedNames.getRanges(String(raw));
  if (ranges && ranges.ranges.length > 0) {
    const first = ranges.ranges[0];
    if (first) {
      const named = first.match(/^([^!]+)!(\$?[A-Z]+\$?\d+)$/u);
      if (named && named[1] && named[2]) {
        return {
          sheetName: normalizeSheetName(named[1]),
          cellRef: named[2].replace(/\$/g, ""),
        };
      }
    }
  }

  return { cellRef: String(raw) };
}

function coerceValue(value) {
  const normalized = String(value).replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) && /^-?\d+(\.\d+)?$/u.test(normalized) ? number : value;
}

async function fillXlsx(buffer, context, mappings, highlight = true) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  for (const mapping of mappings) {
    const value = resolvePath(context, mapping.fieldPath);
    if (value === "") continue;

    const { sheetName, cellRef } = parsePlaceholder(mapping.placeholder, workbook);
    const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!worksheet) continue;

    try {
      const cell = worksheet.getCell(cellRef);
      cell.value = coerceValue(value);
      if (highlight) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" },
        };
      }
    } catch {
      // ignore invalid cell references
    }
  }

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
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

  if (personsRes.error) throw new Error(`case_persons 取得失敗: ${personsRes.error.message}`);
  if (parcelsRes.error) throw new Error(`case_parcels 取得失敗: ${parcelsRes.error.message}`);

  return {
    caseRow,
    casePersons: personsRes.data ?? [],
    parcels: parcelsRes.data ?? [],
  };
}

async function fetchTemplatesByName(supabase, name) {
  const { data, error } = await supabase
    .from("templates")
    .select("id,name,version,is_active,file_type,file_path,description")
    .eq("name", name)
    .eq("file_type", "xlsx")
    .order("version", { ascending: false });

  if (error || !data || data.length === 0) {
    throw new Error(`${name} のテンプレート取得に失敗しました: ${error?.message || "not found"}`);
  }

  return data;
}

function isDebugTemplate(template) {
  return String(template.description ?? "").includes(TEMPLATE_DEBUG_MARKER);
}

async function downloadTemplateBuffer(supabase, filePath) {
  const storagePath = String(filePath).replace(/^templates\//u, "");
  const { data, error } = await supabase.storage.from("templates").download(storagePath);
  if (error || !data) {
    throw new Error(`テンプレート取得に失敗しました: ${error?.message || storagePath}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function writePreviewFile(projectRoot, key, buffer) {
  const outputDir = path.join(projectRoot, OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${key}.xlsx`);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

async function inspectMappings(buffer, mappings) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  return mappings.map((mapping) => {
    const { sheetName, cellRef } = parsePlaceholder(mapping.placeholder, workbook);
    const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    const cell = worksheet?.getCell(cellRef);
    const value = cell?.value;

    return {
      placeholder: mapping.placeholder,
      fieldPath: mapping.fieldPath,
      value:
        value && typeof value === "object" && "text" in value
          ? value.text
          : String(value ?? ""),
    };
  });
}

async function applyMappingsToTemplate(supabase, templateId, mappings) {
  const { error: deleteError } = await supabase
    .from("template_mappings")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) {
    throw new Error(`template_mappings 削除失敗: ${deleteError.message}`);
  }

  const rows = mappings.map((mapping, index) => ({
    template_id: templateId,
    placeholder: mapping.placeholder,
    field_path: mapping.fieldPath,
    label: mapping.label ?? mapping.fieldPath,
    is_required: false,
    sort_order: index,
  }));

  const { error: insertError } = await supabase.from("template_mappings").insert(rows);
  if (insertError) {
    throw new Error(`template_mappings 登録失敗: ${insertError.message}`);
  }
}

async function applyActivationState(supabase, templates, activeTemplateId) {
  const { error: deactivateError } = await supabase
    .from("templates")
    .update({ is_active: false })
    .in(
      "id",
      templates.filter((template) => template.id !== activeTemplateId).map((template) => template.id),
    );
  if (deactivateError) {
    throw new Error(`旧テンプレート無効化失敗: ${deactivateError.message}`);
  }

  const { error: activateError } = await supabase
    .from("templates")
    .update({ is_active: true })
    .eq("id", activeTemplateId);
  if (activateError) {
    throw new Error(`テンプレート有効化失敗: ${activateError.message}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const supabase = await createSupabaseAdmin(projectRoot);

  const targetConfigs = TEMPLATE_CONFIGS.filter((config) => options.templateKeys.has(config.key));
  if (targetConfigs.length === 0) {
    throw new Error("対象テンプレートがありません。--templates を確認してください。");
  }

  for (const config of targetConfigs) {
    const templates = await fetchTemplatesByName(supabase, config.name);
    const cleanTemplate = templates.find((template) => !isDebugTemplate(template));
    if (!cleanTemplate) {
      throw new Error(`${config.name}: 通常版テンプレートが見つかりませんでした。`);
    }

    const caseBundle = await fetchCaseBundle(supabase, config.caseNumber);
    const context = buildTransferContext(
      caseBundle.caseRow,
      caseBundle.casePersons,
      caseBundle.parcels,
    );
    const mappings = config.mappings.map(([placeholder, fieldPath]) => ({
      placeholder,
      fieldPath,
      label: fieldPath,
    }));

    const templateBuffer = await downloadTemplateBuffer(supabase, cleanTemplate.file_path);
    const previewBuffer = await fillXlsx(templateBuffer, context, mappings, true);
    const previewPath = await writePreviewFile(projectRoot, config.key, previewBuffer);
    const previewValues = await inspectMappings(previewBuffer, mappings);

    console.log(`[preview] ${config.name}`);
    console.log(`  template_id: ${cleanTemplate.id}`);
    console.log(`  case_number: ${config.caseNumber}`);
    console.log(`  preview:     ${path.relative(projectRoot, previewPath)}`);
    console.log(
      `  mapped:      ${previewValues
        .slice(0, 10)
        .map((entry) => `${entry.placeholder}=${entry.value}`)
        .join(" / ")}`,
    );

    if (!options.apply) continue;

    await applyMappingsToTemplate(supabase, cleanTemplate.id, mappings);
    await applyActivationState(supabase, templates, cleanTemplate.id);

    console.log(`[applied] ${config.name}`);
    console.log(`  active_template_id: ${cleanTemplate.id}`);
    console.log(`  mapping_count:      ${mappings.length}`);
  }

  if (!options.apply) {
    console.log("");
    console.log("Dry-run only. Add --apply to update Supabase template mappings.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
