#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ExcelJS from "exceljs";

const execFileAsync = promisify(execFile);

const STORAGE_BUCKET_TEMPLATES = "templates";
const REPORT_DIR = path.join("tmp", "toyohashi-mapping-check");
const TEMPLATE_MARKER = "[toyohashi-mapping-check]";
const TOYOHASHI_CODE = "toyohashi_city";
const EXTRA_CATEGORY_SLUGS = ["building_permit", "farmland_conversion"];

const DOCX_FIELD_PATHS = [
  "caseNumber",
  "caseName",
  "caseTypeLabel",
  "submissionTarget",
  "submissionDate",
  "deadlineDate",
  "today",
  "todayYear",
  "todayMonth",
  "todayDay",
  "applicant.name",
  "applicant.nameKana",
  "applicant.zip",
  "applicant.addressPref",
  "applicant.addressCity",
  "applicant.addressTown",
  "applicant.addressLine1",
  "applicant.addressLine2",
  "applicant.addressFull",
  "applicant.addressNoPref",
  "applicant.phone",
  "applicant.fax",
  "applicant.email",
  "applicant.corporateNumber",
  "applicant.representativeName",
  "transferee.name",
  "transferee.nameKana",
  "transferee.zip",
  "transferee.addressPref",
  "transferee.addressCity",
  "transferee.addressTown",
  "transferee.addressLine1",
  "transferee.addressLine2",
  "transferee.addressFull",
  "transferee.addressNoPref",
  "transferee.phone",
  "transferee.fax",
  "transferee.email",
  "transferee.corporateNumber",
  "transferee.representativeName",
  "transferor.name",
  "transferor.nameKana",
  "transferor.zip",
  "transferor.addressPref",
  "transferor.addressCity",
  "transferor.addressTown",
  "transferor.addressLine1",
  "transferor.addressLine2",
  "transferor.addressFull",
  "transferor.addressNoPref",
  "transferor.phone",
  "transferor.fax",
  "transferor.email",
  "transferor.corporateNumber",
  "transferor.representativeName",
  "agent.name",
  "agent.nameKana",
  "agent.zip",
  "agent.addressPref",
  "agent.addressCity",
  "agent.addressTown",
  "agent.addressLine1",
  "agent.addressLine2",
  "agent.addressFull",
  "agent.addressNoPref",
  "agent.phone",
  "agent.fax",
  "agent.email",
  "agent.corporateNumber",
  "agent.representativeName",
  "billing.name",
  "billing.nameKana",
  "billing.zip",
  "billing.addressPref",
  "billing.addressCity",
  "billing.addressTown",
  "billing.addressLine1",
  "billing.addressLine2",
  "billing.addressFull",
  "billing.addressNoPref",
  "billing.phone",
  "billing.fax",
  "billing.email",
  "billing.corporateNumber",
  "billing.representativeName",
  "neighbor.name",
  "neighbor.nameKana",
  "neighbor.zip",
  "neighbor.addressPref",
  "neighbor.addressCity",
  "neighbor.addressTown",
  "neighbor.addressLine1",
  "neighbor.addressLine2",
  "neighbor.addressFull",
  "neighbor.addressNoPref",
  "neighbor.phone",
  "neighbor.fax",
  "neighbor.email",
  "neighbor.corporateNumber",
  "neighbor.representativeName",
  "parcel.pref",
  "parcel.city",
  "parcel.aza",
  "parcel.chiban",
  "parcel.locationFull",
  "parcel.chimoku",
  "parcel.area",
  "parcel.tenyoArea",
  "totalArea",
  "totalTenyoArea",
  "estimateAmount",
  "estimateAmountTax",
  "estimateAmountTotal",
  "invoiceAmount",
  "invoiceAmountTax",
  "invoiceAmountTotal",
];

const XLSX_EXTRA_FIELD_PATHS = [
  "applicants[0].name",
  "applicants[0].addressFull",
  "applicants[0].phone",
  "applicants[0].email",
  "applicants[1].name",
  "applicants[1].addressFull",
  "applicants[1].phone",
  "applicants[1].email",
  "neighbors[0].name",
  "neighbors[0].addressFull",
  "neighbors[0].phone",
  "neighbors[0].email",
  "neighbors[1].name",
  "neighbors[1].addressFull",
  "neighbors[1].phone",
  "neighbors[1].email",
  "parcels[0].chiban",
  "parcels[0].chimoku",
  "parcels[0].area",
  "parcels[1].chiban",
  "parcels[1].chimoku",
  "parcels[1].area",
];

const XLSX_FIELD_PATHS = [...new Set([...DOCX_FIELD_PATHS, ...XLSX_EXTRA_FIELD_PATHS])];

const CASE_TYPE_LABELS = {
  land_improvement: "土地改良区",
  boundary_survey: "境界確定測量",
  building_permit: "建築許可",
  farmland_conversion: "農地転用許可",
  other: "その他",
};

function printUsage() {
  console.log(`Usage: node scripts/setup-toyohashi-mapping-check.mjs [--verify-only]`);
}

function parseArgs(argv) {
  const options = {
    verifyOnly: false,
  };

  for (const arg of argv) {
    if (arg === "--verify-only") {
      options.verifyOnly = true;
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

function normalizeWhitespace(value) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function formatZip(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 7);
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : String(raw || "");
}

function amountStr(value) {
  if (value == null) return "";
  return Number(value).toLocaleString("ja-JP");
}

function taxOf(amount, rate) {
  if (amount == null || rate == null) return null;
  return Math.floor((amount * rate) / 100);
}

function totalOf(amount, rate) {
  const tax = taxOf(amount, rate);
  if (amount == null || tax == null) return null;
  return amount + tax;
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

    const eraYear = year - era.startYear + 1;
    return `${era.name}${eraYear}年${month}月${day}日`;
  }

  return `${year}年${month}月${day}日`;
}

function resolvePath(context, fieldPath) {
  const parts = fieldPath.split(/\.|\[(\d+)\]/u).filter(Boolean);
  let current = context;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = /^\d+$/u.test(part) ? current[Number(part)] : current[part];
  }

  return current == null ? "" : String(current);
}

function buildPersonContext(casePerson) {
  const parts = [
    casePerson.snapshot_address_pref,
    casePerson.snapshot_address_city,
    casePerson.snapshot_address_town,
    casePerson.snapshot_address_line1,
    casePerson.snapshot_address_line2,
  ];
  const addressFull = parts.filter(Boolean).join("");
  const addressNoPref = parts.slice(1).filter(Boolean).join("");

  return {
    name: casePerson.snapshot_name ?? "",
    nameKana: casePerson.snapshot_name_kana ?? "",
    zip: formatZip(casePerson.snapshot_zip ?? ""),
    addressPref: casePerson.snapshot_address_pref ?? "",
    addressCity: casePerson.snapshot_address_city ?? "",
    addressTown: casePerson.snapshot_address_town ?? "",
    addressLine1: casePerson.snapshot_address_line1 ?? "",
    addressLine2: casePerson.snapshot_address_line2 ?? "",
    addressFull,
    addressNoPref,
    phone: casePerson.snapshot_phone ?? "",
    fax: casePerson.snapshot_fax ?? "",
    email: casePerson.snapshot_email ?? "",
    corporateNumber: casePerson.snapshot_corporate_number ?? "",
    representativeName: casePerson.snapshot_representative_name ?? "",
  };
}

function buildTransferContext(caseRow, casePersons, caseParcels, financial) {
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

  const parcels = [...caseParcels]
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

  const now = new Date();
  const totalArea = caseParcels.reduce((sum, parcel) => sum + Number(parcel.area ?? 0), 0);
  const totalTenyo = caseParcels.reduce((sum, parcel) => sum + Number(parcel.tenyo_area ?? 0), 0);

  return {
    caseNumber: caseRow.case_number,
    caseName: caseRow.case_name,
    caseTypeLabel: CASE_TYPE_LABELS[caseRow.case_type] ?? caseRow.case_type,
    submissionTarget: caseRow.submission_target ?? "",
    submissionDate: caseRow.submission_date ? toWareki(new Date(caseRow.submission_date)) : "",
    deadlineDate: caseRow.deadline_date ? toWareki(new Date(caseRow.deadline_date)) : "",
    today: toWareki(now),
    todayYear: `令和${now.getFullYear() - 2018}年`,
    todayMonth: String(now.getMonth() + 1),
    todayDay: String(now.getDate()),
    applicant: byRole.get("applicant") ?? emptyPerson,
    transferee: byRole.get("transferee") ?? emptyPerson,
    transferor: byRole.get("transferor") ?? emptyPerson,
    agent: byRole.get("agent") ?? emptyPerson,
    billing: byRole.get("billing") ?? emptyPerson,
    neighbor: byRole.get("neighbor") ?? emptyPerson,
    applicants,
    neighbors,
    parcels,
    parcel: parcels[0] ?? emptyParcel,
    totalArea: totalArea
      ? totalArea.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    totalTenyoArea: totalTenyo
      ? totalTenyo.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    estimateAmount: amountStr(financial?.estimate_amount),
    estimateAmountTax: amountStr(taxOf(financial?.estimate_amount, financial?.tax_rate)),
    estimateAmountTotal: amountStr(totalOf(financial?.estimate_amount, financial?.tax_rate)),
    invoiceAmount: amountStr(financial?.invoice_amount),
    invoiceAmountTax: amountStr(taxOf(financial?.invoice_amount, financial?.tax_rate)),
    invoiceAmountTotal: amountStr(totalOf(financial?.invoice_amount, financial?.tax_rate)),
  };
}

function buildMappings(fileType) {
  const fieldPaths = fileType === "docx" ? DOCX_FIELD_PATHS : XLSX_FIELD_PATHS;
  if (fileType === "docx") {
    return fieldPaths.map((fieldPath, index) => ({
      placeholder: fieldPath,
      field_path: fieldPath,
      label: fieldPath,
      is_required: false,
      sort_order: index,
    }));
  }

  return fieldPaths.map((fieldPath, index) => ({
    placeholder: `動作確認!B${index + 3}`,
    field_path: fieldPath,
    label: fieldPath,
    is_required: false,
    sort_order: index,
  }));
}

function buildDocxBlock(fieldPaths) {
  const titleParagraph = [
    "<w:p>",
    "<w:r><w:br w:type=\"page\"/></w:r>",
    "<w:r><w:rPr><w:b/></w:rPr><w:t>【動作確認マッピング】</w:t></w:r>",
    "</w:p>",
  ].join("");

  const fieldParagraphs = fieldPaths
    .map((fieldPath) => {
      const label = escapeXml(fieldPath);
      const placeholder = escapeXml(`{${fieldPath}}`);
      return [
        "<w:p>",
        `<w:r><w:t xml:space="preserve">${label}: </w:t></w:r>`,
        `<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>${placeholder}</w:t></w:r>`,
        "</w:p>",
      ].join("");
    })
    .join("");

  return `${titleParagraph}${fieldParagraphs}`;
}

async function prepareDocxVersion(buffer) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "toyohashi-docx-"));
  const inputPath = path.join(tempRoot, "input.docx");
  const extractedDir = path.join(tempRoot, "unzipped");
  const outputPath = path.join(tempRoot, "output.docx");

  await fs.mkdir(extractedDir, { recursive: true });
  await fs.writeFile(inputPath, buffer);
  await execFileAsync("unzip", ["-qq", inputPath, "-d", extractedDir]);

  const documentXmlPath = path.join(extractedDir, "word", "document.xml");
  const xml = await fs.readFile(documentXmlPath, "utf8");
  if (xml.includes("【動作確認マッピング】")) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    return { buffer, mappings: buildMappings("docx") };
  }

  const block = buildDocxBlock(DOCX_FIELD_PATHS);
  let replaced = false;
  const patched = xml.replace(/(<w:sectPr[\s\S]*?<\/w:sectPr>)/u, (match) => {
    replaced = true;
    return `${block}${match}`;
  });

  await fs.writeFile(
    documentXmlPath,
    replaced ? patched : xml.replace("</w:body>", `${block}</w:body>`),
    "utf8",
  );
  await execFileAsync("zip", ["-qr", outputPath, "."], { cwd: extractedDir });
  const outputBuffer = await fs.readFile(outputPath);
  await fs.rm(tempRoot, { recursive: true, force: true });

  return { buffer: outputBuffer, mappings: buildMappings("docx") };
}

async function prepareXlsxVersion(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const existing = workbook.getWorksheet("動作確認");
  if (existing) workbook.removeWorksheet(existing.id);

  const sheet = workbook.addWorksheet("動作確認");
  sheet.columns = [
    { width: 36 },
    { width: 36 },
    { width: 24 },
  ];
  sheet.getCell("A1").value = "動作確認マッピング";
  sheet.getCell("A1").font = { bold: true };
  sheet.getCell("A2").value = "ラベル";
  sheet.getCell("B2").value = "転記先";
  sheet.getCell("C2").value = "フィールドパス";
  sheet.getRow(2).font = { bold: true };

  XLSX_FIELD_PATHS.forEach((fieldPath, index) => {
    const rowNumber = index + 3;
    sheet.getCell(`A${rowNumber}`).value = fieldPath;
    sheet.getCell(`C${rowNumber}`).value = fieldPath;
    sheet.getCell(`B${rowNumber}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFDE68A" },
    };
  });

  const output = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(output),
    mappings: buildMappings("xlsx"),
  };
}

function fillDocx(buffer, context) {
  const zip = new PizZip(toArrayBuffer(buffer));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  });
  doc.render(context);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

async function fillXlsx(buffer, context, mappings) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  for (const mapping of mappings) {
    const value = resolvePath(context, mapping.field_path);
    if (value === "") continue;

    const placeholder = mapping.placeholder;
    const match = placeholder.match(/^([^!]+)!(.+)$/u);
    const sheet = match ? workbook.getWorksheet(match[1]) : workbook.worksheets[0];
    const cellRef = match ? match[2] : placeholder;
    if (!sheet) continue;

    try {
      sheet.getCell(cellRef).value = value;
    } catch {
      // invalid cell reference
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

async function getAdminUserId(supabase) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`管理者ユーザー取得に失敗しました: ${error.message}`);
  return data?.id ?? null;
}

async function getToyohashiMunicipalityId(supabase) {
  const { data, error } = await supabase
    .from("location_municipalities")
    .select("id")
    .eq("code", TOYOHASHI_CODE)
    .single();
  if (error || !data) throw new Error("豊橋市マスタが見つかりませんでした。");
  return data.id;
}

async function upsertTestPerson(supabase) {
  const personPayload = {
    person_type: "corporation",
    name: "株式会社テスト測量 豊橋動作確認",
    name_kana: "カブシキガイシャテストソクリョウ トヨハシドウサカクニン",
    zip: "4418077",
    address_pref: "愛知県",
    address_city: "豊橋市",
    address_town: "神野新田町",
    address_line1: "字テスト123-4",
    address_line2: "豊橋マッピングビル 5F",
    phone: "0532-11-2233",
    fax: "0532-11-2244",
    email: "toyohashi-mapping-check@example.com",
    corporate_number: "1234567890123",
    representative_name: "検証 太郎",
    name_normalized: "株式会社テスト測量豊橋動作確認",
    memo: "豊橋市様式のマッピング動作確認用データ",
  };

  const { data: existing, error: selectError } = await supabase
    .from("persons")
    .select("id")
    .eq("email", personPayload.email)
    .maybeSingle();
  if (selectError) {
    throw new Error(`動作確認用人物の検索に失敗しました: ${selectError.message}`);
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("persons")
      .update(personPayload)
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`動作確認用人物の更新に失敗しました: ${updateError.message}`);
    }
    return { id: existing.id, ...personPayload };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("persons")
    .insert(personPayload)
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(`動作確認用人物の登録に失敗しました: ${insertError?.message || "unknown"}`);
  }

  return { id: inserted.id, ...personPayload };
}

async function upsertTestCase(supabase, adminUserId, caseType, caseName) {
  const payload = {
    case_name: caseName,
    case_type: caseType,
    status: "in_progress",
    assigned_user_id: adminUserId,
    submission_target: "豊橋市 まちづくり局 動作確認窓口",
    submission_date: "2026-04-24",
    deadline_date: "2026-05-08",
    memo: "豊橋市様式の一括マッピング動作確認用案件",
  };

  const { data: existing, error: selectError } = await supabase
    .from("cases")
    .select("id, case_number")
    .eq("case_name", caseName)
    .maybeSingle();
  if (selectError) {
    throw new Error(`動作確認用案件の検索に失敗しました: ${selectError.message}`);
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("cases")
      .update(payload)
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`動作確認用案件の更新に失敗しました: ${updateError.message}`);
    }
    return { id: existing.id, case_number: existing.case_number };
  }

  const { data: nextNumber, error: rpcError } = await supabase.rpc("next_case_number", {
    p_case_type: caseType,
  });
  if (rpcError || !nextNumber) {
    throw new Error(`案件番号採番に失敗しました: ${rpcError?.message || "unknown"}`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("cases")
    .insert({ case_number: nextNumber, ...payload })
    .select("id, case_number")
    .single();
  if (insertError || !inserted) {
    throw new Error(`動作確認用案件の登録に失敗しました: ${insertError?.message || "unknown"}`);
  }

  return inserted;
}

async function syncCaseData(supabase, caseId, person) {
  const { error: deleteCasePersonsError } = await supabase
    .from("case_persons")
    .delete()
    .eq("case_id", caseId);
  if (deleteCasePersonsError) {
    throw new Error(`case_persons の初期化に失敗しました: ${deleteCasePersonsError.message}`);
  }

  const snapshotBase = {
    snapshot_name: person.name,
    snapshot_name_kana: person.name_kana,
    snapshot_zip: person.zip,
    snapshot_address_pref: person.address_pref,
    snapshot_address_city: person.address_city,
    snapshot_address_town: person.address_town,
    snapshot_address_line1: person.address_line1,
    snapshot_address_line2: person.address_line2,
    snapshot_phone: person.phone,
    snapshot_fax: person.fax,
    snapshot_email: person.email,
    snapshot_corporate_number: person.corporate_number,
    snapshot_representative_name: person.representative_name,
    snapshot_at: new Date().toISOString(),
  };

  const casePersons = [
    { role: "applicant", sort_order: 0 },
    { role: "applicant", sort_order: 1 },
    { role: "transferee", sort_order: 2 },
    { role: "transferor", sort_order: 3 },
    { role: "agent", sort_order: 4 },
    { role: "billing", sort_order: 5 },
    { role: "neighbor", sort_order: 6 },
    { role: "neighbor", sort_order: 7 },
  ].map((row) => ({
    case_id: caseId,
    person_id: person.id,
    memo: "動作確認用ロール割当",
    ...snapshotBase,
    ...row,
  }));

  const { error: insertCasePersonsError } = await supabase
    .from("case_persons")
    .insert(casePersons);
  if (insertCasePersonsError) {
    throw new Error(`case_persons の登録に失敗しました: ${insertCasePersonsError.message}`);
  }

  const { error: deleteParcelsError } = await supabase
    .from("case_parcels")
    .delete()
    .eq("case_id", caseId);
  if (deleteParcelsError) {
    throw new Error(`case_parcels の初期化に失敗しました: ${deleteParcelsError.message}`);
  }

  const parcelRows = [
    {
      case_id: caseId,
      sort_order: 0,
      pref: "愛知県",
      city: "豊橋市",
      aza: "神野新田町字ワノ割",
      chiban: "88番1",
      chimoku: "田",
      area: 1234.56,
      tenyo_area: 987.65,
      memo: "動作確認用 1筆目",
    },
    {
      case_id: caseId,
      sort_order: 1,
      pref: "愛知県",
      city: "豊橋市",
      aza: "神野新田町字ヨノ割",
      chiban: "88番2",
      chimoku: "畑",
      area: 654.32,
      tenyo_area: 321.09,
      memo: "動作確認用 2筆目",
    },
  ];

  const { error: insertParcelsError } = await supabase.from("case_parcels").insert(parcelRows);
  if (insertParcelsError) {
    throw new Error(`case_parcels の登録に失敗しました: ${insertParcelsError.message}`);
  }

  const { error: deleteFinancialError } = await supabase
    .from("case_financials")
    .delete()
    .eq("case_id", caseId);
  if (deleteFinancialError) {
    throw new Error(`case_financials の初期化に失敗しました: ${deleteFinancialError.message}`);
  }

  const { error: insertFinancialError } = await supabase.from("case_financials").insert({
    case_id: caseId,
    estimate_amount: 1800000,
    invoice_amount: 2200000,
    paid_amount: 0,
    paid_date: null,
    tax_rate: 10,
    memo: "動作確認用金額データ",
  });
  if (insertFinancialError) {
    throw new Error(`case_financials の登録に失敗しました: ${insertFinancialError.message}`);
  }
}

function appendMarker(description) {
  const base = normalizeWhitespace(description || "");
  if (base.includes(TEMPLATE_MARKER)) return base;
  return `${base} ${TEMPLATE_MARKER}`.trim();
}

function isPreparedTemplate(template) {
  return String(template.description ?? "").includes(TEMPLATE_MARKER);
}

function buildTemplateGroupKey(template) {
  return [
    template.category_id,
    template.municipality_id ?? "",
    template.file_type,
    template.original_file_name ?? "",
    template.name,
  ].join("|");
}

function pickLatestTemplateByKey(templates, predicate = () => true) {
  const byKey = new Map();

  for (const template of templates) {
    if (!predicate(template)) continue;

    const key = buildTemplateGroupKey(template);
    const current = byKey.get(key);
    if (
      !current ||
      Number(template.version ?? 0) > Number(current.version ?? 0) ||
      (Number(template.version ?? 0) === Number(current.version ?? 0) &&
        Number(template.id ?? 0) > Number(current.id ?? 0))
    ) {
      byKey.set(key, template);
    }
  }

  return byKey;
}

function shouldPrepareTemplate(template, toyohashiMunicipalityId) {
  const categorySlug = template.template_categories?.slug ?? "";
  return (
    template.municipality_id === toyohashiMunicipalityId ||
    (template.municipality_id == null && EXTRA_CATEGORY_SLUGS.includes(categorySlug))
  );
}

function pickCaseBundle(caseBundles, categorySlug) {
  if (categorySlug === "boundary_survey") return caseBundles.boundarySurvey;
  if (categorySlug === "building_permit") return caseBundles.buildingPermit;
  if (categorySlug === "farmland_conversion") return caseBundles.farmlandConversion;
  return caseBundles.landImprovement;
}

async function downloadTemplateBuffer(supabase, template) {
  const objectPath = String(template.file_path).replace(/^templates\//u, "");
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_TEMPLATES)
    .download(objectPath);
  if (error || !data) {
    throw new Error(`${template.name}: テンプレートのダウンロードに失敗しました: ${error?.message || "unknown"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function createTemplateVersion(supabase, adminUserId, template, prepared) {
  const nextVersion = Number(template.version ?? 1) + 1;
  const fileType = template.file_type;
  const categorySlug = template.template_categories.slug;

  const { data: inserted, error: insertError } = await supabase
    .from("templates")
    .insert({
      name: template.name,
      category_id: template.category_id,
      municipality_id: template.municipality_id,
      description: appendMarker(template.description),
      file_type: fileType,
      file_path: "templates/_pending",
      original_file_name: template.original_file_name,
      version: nextVersion,
      is_active: false,
      applicable_case_types: template.applicable_case_types,
      uploaded_by_user_id: adminUserId,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(`${template.name}: 新バージョン登録に失敗しました: ${insertError?.message || "unknown"}`);
  }

  const storagePath = `${categorySlug}/${inserted.id}_v${nextVersion}.${fileType}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET_TEMPLATES)
    .upload(storagePath, prepared.buffer, {
      contentType:
        fileType === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
  if (uploadError) {
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`${template.name}: 新バージョンのアップロードに失敗しました: ${uploadError.message}`);
  }

  const { error: updatePathError } = await supabase
    .from("templates")
    .update({ file_path: `templates/${storagePath}` })
    .eq("id", inserted.id);
  if (updatePathError) {
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([storagePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`${template.name}: file_path 更新に失敗しました: ${updatePathError.message}`);
  }

  const mappings = prepared.mappings.map((mapping) => ({
    template_id: inserted.id,
    ...mapping,
  }));
  const { error: insertMappingsError } = await supabase
    .from("template_mappings")
    .insert(mappings);
  if (insertMappingsError) {
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([storagePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`${template.name}: template_mappings 登録に失敗しました: ${insertMappingsError.message}`);
  }

  return inserted.id;
}

async function prepareCheckTemplates(supabase, adminUserId, toyohashiMunicipalityId) {
  const { data: templates, error } = await supabase
    .from("templates")
    .select("*, template_categories(slug)")
    .order("id");
  if (error) {
    throw new Error(`動作確認テンプレートの取得に失敗しました: ${error.message}`);
  }

  const summary = [];
  const rows = templates ?? [];
  const preparedByKey = pickLatestTemplateByKey(rows, (template) => isPreparedTemplate(template));
  const targetTemplates = rows.filter(
    (template) =>
      template.is_active &&
      !isPreparedTemplate(template) &&
      shouldPrepareTemplate(template, toyohashiMunicipalityId),
  );

  for (const template of targetTemplates) {
    const existingPrepared = preparedByKey.get(buildTemplateGroupKey(template));
    if (existingPrepared) {
      summary.push({
        templateId: existingPrepared.id,
        previousTemplateId: template.id,
        name: existingPrepared.name,
        version: existingPrepared.version,
        categorySlug: existingPrepared.template_categories?.slug ?? null,
        action: "reuse",
      });
      continue;
    }

    const buffer = await downloadTemplateBuffer(supabase, template);
    const prepared =
      template.file_type === "docx"
        ? await prepareDocxVersion(buffer)
        : await prepareXlsxVersion(buffer);
    const newTemplateId = await createTemplateVersion(supabase, adminUserId, template, prepared);
    preparedByKey.set(buildTemplateGroupKey(template), {
      ...template,
      id: newTemplateId,
      version: Number(template.version ?? 1) + 1,
      is_active: false,
      description: appendMarker(template.description),
    });

    summary.push({
      templateId: newTemplateId,
      previousTemplateId: template.id,
      name: template.name,
      version: Number(template.version ?? 1) + 1,
      categorySlug: template.template_categories?.slug ?? null,
      action: "new-version",
    });
  }

  return summary;
}

async function fetchCaseBundle(supabase, caseId) {
  const [caseRes, personsRes, parcelsRes, financialRes] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).single(),
    supabase.from("case_persons").select("*").eq("case_id", caseId).order("sort_order"),
    supabase.from("case_parcels").select("*").eq("case_id", caseId).order("sort_order"),
    supabase.from("case_financials").select("*").eq("case_id", caseId).maybeSingle(),
  ]);

  if (caseRes.error || !caseRes.data) {
    throw new Error(`case ${caseId} の取得に失敗しました: ${caseRes.error?.message || "unknown"}`);
  }

  return {
    caseRow: caseRes.data,
    casePersons: personsRes.data ?? [],
    caseParcels: parcelsRes.data ?? [],
    financial: financialRes.data ?? null,
  };
}

function safeFileName(value) {
  return value.replace(/[\\/:*?"<>|　]/gu, "_");
}

async function verifyCheckTemplates(supabase, toyohashiMunicipalityId, reportRoot, caseIds) {
  await fs.mkdir(reportRoot, { recursive: true });

  const { data: templates, error } = await supabase
    .from("templates")
    .select("*, template_categories(slug), template_mappings(*)")
    .order("id");
  if (error) {
    throw new Error(`検証対象テンプレート取得に失敗しました: ${error.message}`);
  }

  const preparedByKey = pickLatestTemplateByKey(
    templates ?? [],
    (template) =>
      isPreparedTemplate(template) &&
      shouldPrepareTemplate(template, toyohashiMunicipalityId),
  );
  const targetTemplates = Array.from(preparedByKey.values()).sort(
    (a, b) => Number(a.id ?? 0) - Number(b.id ?? 0),
  );

  if (targetTemplates.length === 0) {
    throw new Error("動作確認用テンプレートが見つかりません。先に通常実行で準備してください。");
  }
  const [landImprovement, boundarySurvey, buildingPermit, farmlandConversion] =
    await Promise.all([
      fetchCaseBundle(supabase, caseIds.landImprovement),
      fetchCaseBundle(supabase, caseIds.boundarySurvey),
      fetchCaseBundle(supabase, caseIds.buildingPermit),
      fetchCaseBundle(supabase, caseIds.farmlandConversion),
    ]);
  const caseBundles = {
    landImprovement,
    boundarySurvey,
    buildingPermit,
    farmlandConversion,
  };

  const results = [];
  for (const template of targetTemplates) {
    const categorySlug = template.template_categories?.slug ?? "";
    const caseBundle = pickCaseBundle(caseBundles, categorySlug);
    const context = buildTransferContext(
      caseBundle.caseRow,
      caseBundle.casePersons,
      caseBundle.caseParcels,
      caseBundle.financial,
    );

    const buffer = await downloadTemplateBuffer(supabase, template);
    const mappings = (template.template_mappings ?? []).map((mapping) => ({
      placeholder: mapping.placeholder,
      field_path: mapping.field_path,
    }));

    const outputBuffer =
      template.file_type === "docx"
        ? fillDocx(buffer, context)
        : await fillXlsx(buffer, context, mappings);

    const outputName = `${String(template.id).padStart(3, "0")}_${safeFileName(template.name)}.${template.file_type}`;
    const outputPath = path.join(reportRoot, outputName);
    await fs.writeFile(outputPath, outputBuffer);

    const filledCount = mappings.reduce((count, mapping) => {
      return count + (resolvePath(context, mapping.field_path) ? 1 : 0);
    }, 0);

    results.push({
      templateId: template.id,
      templateName: template.name,
      categorySlug,
      fileType: template.file_type,
      caseNumber: caseBundle.caseRow.case_number,
      mappings: mappings.length,
      filledMappings: filledCount,
      outputPath,
    });
  }

  await fs.writeFile(
    path.join(reportRoot, "report.json"),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf8",
  );

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const reportRoot = path.join(projectRoot, REPORT_DIR);
  const supabase = await createSupabaseAdmin(projectRoot);

  const adminUserId = await getAdminUserId(supabase);
  const toyohashiMunicipalityId = await getToyohashiMunicipalityId(supabase);

  const person = await upsertTestPerson(supabase);
  const landCase = await upsertTestCase(
    supabase,
    adminUserId,
    "land_improvement",
    "【動作確認】豊橋市マッピング検証（土地改良区）",
  );
  const boundaryCase = await upsertTestCase(
    supabase,
    adminUserId,
    "boundary_survey",
    "【動作確認】豊橋市マッピング検証（境界確定測量）",
  );
  const buildingPermitCase = await upsertTestCase(
    supabase,
    adminUserId,
    "building_permit",
    "【動作確認】汎用マッピング検証（建築許可）",
  );
  const farmlandConversionCase = await upsertTestCase(
    supabase,
    adminUserId,
    "farmland_conversion",
    "【動作確認】汎用マッピング検証（農地転用許可）",
  );

  await syncCaseData(supabase, landCase.id, person);
  await syncCaseData(supabase, boundaryCase.id, person);
  await syncCaseData(supabase, buildingPermitCase.id, person);
  await syncCaseData(supabase, farmlandConversionCase.id, person);

  let templateSummary = [];
  if (!options.verifyOnly) {
    templateSummary = await prepareCheckTemplates(
      supabase,
      adminUserId,
      toyohashiMunicipalityId,
    );
  }

  const verifyResults = await verifyCheckTemplates(
    supabase,
    toyohashiMunicipalityId,
    reportRoot,
    {
      landImprovement: landCase.id,
      boundarySurvey: boundaryCase.id,
      buildingPermit: buildingPermitCase.id,
      farmlandConversion: farmlandConversionCase.id,
    },
  );

  console.log("Toyohashi mapping check completed.");
  console.log("");
  console.log("Test person");
  console.log(`  person_id: ${person.id}`);
  console.log(`  name:      ${person.name}`);
  console.log("");
  console.log("Test cases");
  console.log(`  land_improvement: ${landCase.id} (${landCase.case_number})`);
  console.log(`  boundary_survey:  ${boundaryCase.id} (${boundaryCase.case_number})`);
  console.log(`  building_permit:  ${buildingPermitCase.id} (${buildingPermitCase.case_number})`);
  console.log(
    `  farmland_conversion: ${farmlandConversionCase.id} (${farmlandConversionCase.case_number})`,
  );
  console.log("");

  if (!options.verifyOnly) {
    console.log("Template setup");
    for (const item of templateSummary) {
      const previous = item.previousTemplateId ? ` <= ${item.previousTemplateId}` : "";
      console.log(
        `  ${item.action}: template#${item.templateId}${previous} [${item.categorySlug ?? "unknown"}] ${item.name} v${item.version}`,
      );
    }
    console.log("");
  }

  console.log("Verification");
  for (const result of verifyResults) {
    console.log(
      `  template#${result.templateId} [${result.categorySlug || "unknown"}] ${result.templateName}: ${result.filledMappings}/${result.mappings} fields -> ${path.relative(projectRoot, result.outputPath)}`,
    );
  }
  console.log("");
  console.log(`Report: ${path.relative(projectRoot, path.join(reportRoot, "report.json"))}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
