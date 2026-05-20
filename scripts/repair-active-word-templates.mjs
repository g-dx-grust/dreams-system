#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const STORAGE_BUCKET_TEMPLATES = "templates";
const OUTPUT_DIR = path.join("tmp", "repair-active-word-templates");

const TARGETS = {
  2: {
    name: "境界確定証明交付申請書 令和（豊川市）",
    patches: [
      p("令和　　年　　月　　日", "{today}"),
      p("申請者　住所　豊橋市牛川通二丁目10番地2", "申請者　住所　{applicant.addressFull}"),
      p("氏名　土地家屋調査士　山本真基", "氏名　{applicant.name}"),
      p("電話　0532-55-1230", "電話　{applicant.phone}"),
      p("豊川市御油町膳ノ棚47番2", "{parcel.locationFull}"),
      p(
        "(1)地図訂正　　(2)地積更正　　(3)分筆　　 (4)その他（　　売買のため　　）",
        "(1)地図訂正　　(2)地積更正　　(3)分筆　　 (4)その他（　　{caseMemo}　　）",
      ),
      p("３　現地立会年月日　　　令和3年5月26日", "３　現地立会年月日　　　{submissionDate}"),
      p("年　　月　　日", "{today}"),
      p("豊川市　　　　　　　　　　　　　　　　　　　　番", "{parcel.locationFull}"),
    ],
  },
  3: {
    name: "公共用地境界確定申請書 令和（豊川市）",
    patches: [
      p("令和　　年　　月　　日", "{today}", { all: true }),
      p("申請者　住所", "申請者　住所　{applicant.addressFull}", { all: true }),
      p("氏名", "氏名　{applicant.name}", { occurrence: 1 }),
      p("電話", "電話　{applicant.phone}", { occurrence: 1 }),
      p("代理人　住所　豊橋市前田南町一丁目1番地5", "代理人　住所　{agent.addressFull}"),
      p("氏名　土地家屋調査士　山本真基　㊞", "氏名　{agent.name}　㊞"),
      p("電話　0532-26-3590", "電話　{agent.phone}"),
      p("地目　　　地積　　　㎡", "{parcel.locationFull}　{parcel.chimoku}　{parcel.area}㎡", {
        occurrence: 1,
      }),
      p("(1)地図訂正　　(2)地積更正　　(3)分筆　　 (4)その他（　　　　　）", "(1)地図訂正　　(2)地積更正　　(3)分筆　　 (4)その他（　{caseMemo}　）"),
      p("地目　　　　地積　　　㎡", "{parcel.locationFull}　{parcel.chimoku}　{parcel.area}㎡"),
      p("氏名", "氏名　{applicant.name}", { occurrence: 1 }),
    ],
  },
  4: {
    name: "立会委任状（豊川市）",
    patches: [
      p("受任者　住所", "受任者　住所　{agent.addressFull}"),
      p("氏名", "氏名　{agent.name}", { occurrence: 1 }),
      p("豊川市上野四丁目　　　　　　番", "{parcel.locationFull}"),
      p("年　　月　　日", "{today}"),
      p("委任者　住所", "委任者　住所　{applicant.addressFull}"),
      p("氏名　　　　　　　　　　　　㊞", "氏名　{applicant.name}　㊞"),
    ],
  },
  24: landImprovementNoticePatches("01農地転用等の通知書（豊川総合用水土地改良区）"),
  25: landImprovementApplicationPatches("02地区除外申請書（豊川総合用水土地改良区）"),
  26: {
    name: "03誓約書（転用組合員）（豊川総合用水土地改良区）",
    patches: [
      p("令和　　年　　月　　日付けで提出しました農地転用等の通知に対し、貴土地改良区地区除外等処理規程第３条により協議を受けました下記事項を、承諾し履行することを誓約します。", "{submissionDate}付けで提出しました農地転用等の通知に対し、貴土地改良区地区除外等処理規程第３条により協議を受けました下記事項を、承諾し履行することを誓約します。"),
      p("令和　　年　　月　　日", "{today}"),
      p("住所", "住所　{transferor.addressFull}"),
      p("氏名 ㊞", "氏名　{transferor.name}　㊞"),
    ],
  },
  27: {
    name: "04誓約書（転用関係者）（豊川総合用水土地改良区）",
    patches: [
      p("令和　　年　　月　　日付けで提出しました農地転用等の通知に対し、貴土地改良区地区除外等処理規程第３条により協議を受けました下記事項を、承諾し履行することを誓約します。", "{submissionDate}付けで提出しました農地転用等の通知に対し、貴土地改良区地区除外等処理規程第３条により協議を受けました下記事項を、承諾し履行することを誓約します。"),
      p("令和　　年　　月　　日", "{today}"),
      p("住所", "住所　{transferee.addressFull}"),
      p("氏名 ㊞", "氏名　{transferee.name}　㊞"),
    ],
  },
  28: {
    name: "05地積訂正届出書（豊川総合用水土地改良区）",
    patches: [
      p("令和　　年　　月　　日", "{today}"),
      p("住　所", "住　所　{transferor.addressFull}"),
      p("氏　名　　　　　　　　　　　㊞", "氏　名　{transferor.name}　㊞"),
      p("１．土　地　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　豊　橋　市", "１．土　地　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　{parcel.city}"),
      p("大字名", "大字名　{parcel.aza}", { occurrence: 2 }),
      p("字名", "字名　{parcel.aza}", { occurrence: 2 }),
      p("地番", "地番　{parcel.chiban}", { occurrence: 2 }),
      p("地目", "地目　{parcel.chimoku}", { occurrence: 2 }),
      p("地積", "地積　{parcel.area}", { occurrence: 2 }),
    ],
  },
  29: {
    name: "09農地転用取り下げ願 い（豊川総合用水土地改良区）",
    patches: [
      p("令和　　年　　月　　日", "{today}", { occurrence: 1 }),
      p("476250066675転用組合員　住所", "転用組合員　住所　{transferor.addressFull}"),
      p("氏名　　　　　　　　　　　　　　印", "氏名　{transferor.name}　印", { occurrence: 1 }),
      p("476250076200転用関係者　住所", "転用関係者　住所　{transferee.addressFull}"),
      p("氏名　　　　　　　　　　　　　　印", "氏名　{transferee.name}　印", { occurrence: 1 }),
      p("令和　　年　　月　　日付けで、申請をしました農地転用について下記のとおり取り下げをお願いします。", "{submissionDate}付けで、申請をしました農地転用について下記のとおり取り下げをお願いします。"),
      p("土地の表示", "土地の表示　{parcel.locationFull}　{parcel.chimoku}　{parcel.area}㎡"),
      p("取り下げ理由", "取り下げ理由　{caseMemo}"),
    ],
  },
  33: {
    name: "同意書交付願（豊川総合用水土地改良区）",
    patches: [
      p("令和　　年　　月　　日", "{today}"),
      p("住所　名古屋市中区金山五丁目13番21号", "住所　{applicant.addressFull}"),
      p("4740275271145氏名　株式会社隼人建設", "氏名　{applicant.name}"),
      p("代表取締役　彦　坂　昇　二", "代表者　{applicant.representativeName}"),
      p("豊橋市大崎町字伊豆沢24番　　畑　　1072㎡", "{parcels[0].locationFull}　{parcels[0].chimoku}　{parcels[0].area}㎡"),
      p("豊橋市大崎町字伊豆沢31番　　畑　　2786㎡", "{parcels[1].locationFull}　{parcels[1].chimoku}　{parcels[1].area}㎡"),
      p("豊橋市大崎町字浪入9番地　坂　柳　清　美", "{transferor.addressFull}　{transferor.name}"),
      p("資材置場・駐車場", "{caseMemo}"),
    ],
  },
};

const DEACTIVATE_REFERENCE_TEMPLATE_IDS = [31];

function p(search, replacement, options = {}) {
  return { search, replacement, ...options };
}

function landImprovementNoticePatches(name) {
  return {
    name,
    patches: [
      p("令和　　年　　月　　日", "{today}"),
      p("5128895106680 　　　　　　 住　所", "住　所　{transferor.addressFull}"),
      p("氏　名　 　 　　　　㊞", "氏　名　{transferor.name}　㊞", { occurrence: 1 }),
      p("5128895119380 　　　　　 　　 住　所", "住　所　{transferee.addressFull}"),
      p("氏　名　 　　 　　　　㊞", "氏　名　{transferee.name}　㊞"),
      p("１．土　地 　 豊　橋　市", "１．土　地 　 {parcel.city}"),
      p("大字名", "大字名　{parcel.aza}"),
      p("字名", "字名　{parcel.aza}"),
      p("地番", "地番　{parcel.chiban}"),
      p("地目", "地目　{parcel.chimoku}"),
      p("受益面積", "受益面積　{parcel.area}㎡"),
      p("転用面積", "転用面積　{parcel.tenyoArea}㎡"),
      p("転用の事由", "転用の事由　{caseMemo}"),
      p("３．農業委員会に（県知事）に（ 転用許可申請書転 用 届 出 書 ）を提出しようとする日", "３．農業委員会に（県知事）に（ 転用許可申請書転 用 届 出 書 ）を提出しようとする日　{submissionDate}"),
    ],
  };
}

function landImprovementApplicationPatches(name) {
  return {
    name,
    patches: [
      p("令和　　 年　 　月 　　日通知に係る下記土地につき農地法による許可を受け、これを転用するので土地改良区の地区から除外されたく申請する。", "{submissionDate}通知に係る下記土地につき農地法による許可を受け、これを転用するので土地改良区の地区から除外されたく申請する。"),
      p("令和　　年　　月　　日", "{today}"),
      p("住　所", "住　所　{transferor.addressFull}", { occurrence: 1 }),
      p("氏　名　 ㊞", "氏　名　{transferor.name}　㊞", { occurrence: 1 }),
      p("住　所", "住　所　{transferee.addressFull}", { occurrence: 1 }),
      p("氏　名　 ㊞", "氏　名　{transferee.name}　㊞", { occurrence: 1 }),
      p("１．土　地 　豊　川　市", "１．土　地 　{parcel.city}"),
      p("大字名", "大字名　{parcel.aza}"),
      p("字名", "字名　{parcel.aza}"),
      p("地番", "地番　{parcel.chiban}"),
      p("地目", "地目　{parcel.chimoku}"),
      p("受益面積", "受益面積　{parcel.area}㎡"),
      p("転用面積", "転用面積　{parcel.tenyoArea}㎡"),
      p("転用の事由", "転用の事由　{caseMemo}"),
    ],
  };
}

function printUsage() {
  console.log(`Usage: node scripts/repair-active-word-templates.mjs [options]

Options:
  --apply     Supabase に新バージョン登録し、99参考を無効化する
  --help      このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = { apply: false };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
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
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
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

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXmlText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paragraphText(xml) {
  return decodeXmlText(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .trim();
}

function replaceParagraphText(paragraphXml, replacement) {
  let firstText = true;
  return paragraphXml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs) => {
    if (firstText) {
      firstText = false;
      return `<w:t${attrs}>${escapeXmlText(replacement)}</w:t>`;
    }
    return match.replace(/>[\s\S]*?</, "><");
  });
}

function applyParagraphPatch(xml, patch) {
  let seen = 0;
  let changed = 0;
  const next = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    if (paragraphText(paragraphXml) !== patch.search) return paragraphXml;
    seen += 1;

    if (patch.occurrence && seen !== patch.occurrence) return paragraphXml;
    changed += 1;
    return replaceParagraphText(paragraphXml, patch.replacement);
  });

  if (changed === 0) {
    throw new Error(`置換対象が見つかりません: ${patch.search}`);
  }

  if (!patch.all && !patch.occurrence && changed > 1) {
    throw new Error(`置換対象が複数見つかりました。all または occurrence を指定してください: ${patch.search}`);
  }

  return next;
}

function patchTemplateBuffer(buffer, patches) {
  const zip = new PizZip(buffer);
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) throw new Error("word/document.xml が見つかりません。");

  let xml = documentXml.asText();
  for (const patch of patches) {
    xml = applyParagraphPatch(xml, patch);
  }
  zip.file("word/document.xml", xml);

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function detectPlaceholders(buffer) {
  const zip = new PizZip(buffer);
  const found = new Set();

  for (const fileName of Object.keys(zip.files)) {
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/u.test(fileName)) continue;
    const xml = zip.file(fileName)?.asText() ?? "";
    const plain = xml.replace(/<[^>]+>/g, "");
    for (const match of plain.matchAll(/\{([^{}#/^][^{}]*)\}/g)) {
      const key = match[1]?.trim();
      if (key) found.add(key);
    }
  }

  return Array.from(found).sort();
}

function splitFieldPath(pathValue) {
  return String(pathValue).split(/\.|\[(\d+)\]/u).filter(Boolean);
}

function resolveRawPath(ctx, pathValue) {
  let current = ctx;
  for (const part of splitFieldPath(pathValue)) {
    if (current == null || typeof current !== "object") return undefined;
    current = /^\d+$/u.test(part) ? current[Number(part)] : current[part];
  }
  return current;
}

function createTransferParser(tag) {
  const normalizedTag = String(tag ?? "").trim();
  return {
    get(scope, context) {
      if (!normalizedTag) return undefined;
      if (normalizedTag === "." || normalizedTag === "this") return scope;

      const scopes = context.scopeList ?? [];
      const root = scopes[0] ?? scope;
      const fromScope = resolveRawPath(scope, normalizedTag);
      if (fromScope !== undefined) return fromScope;
      return resolveRawPath(root, normalizedTag);
    },
  };
}

function renderPreview(buffer) {
  const context = {
    caseNumber: "VERIFY-CASE-001",
    caseName: "転記検証案件",
    caseMemo: "資材置場・駐車場",
    caseTypeLabel: "農地転用許可",
    submissionTarget: "豊橋市農業委員会",
    submissionDate: "令和8年5月20日",
    deadlineDate: "令和8年6月30日",
    today: "令和8年5月20日",
    todayYear: "令和8年",
    todayMonth: "5",
    todayDay: "20",
    applicant: person("検証申請者", "愛知県豊橋市今橋町1番地", "0532-00-0001"),
    transferee: person("検証転用関係者", "愛知県豊橋市駅前大通2-1", "0532-00-1001"),
    transferor: person("検証転用組合員", "愛知県豊橋市大岩町3-2", "0532-00-2001"),
    agent: person("検証代理人", "愛知県豊橋市前田南町1-1", "0532-00-3001"),
    parcel: parcel("100-1", "畑", "123.45"),
    parcels: [parcel("100-1", "畑", "123.45"), parcel("100-2", "田", "234.56")],
  };
  context.applicant.representativeName = "検証代表者";

  try {
    const doc = new Docxtemplater(new PizZip(buffer), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
      parser: createTransferParser,
    });
    doc.render(context);
    return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (error) {
    const details = error?.properties?.errors
      ?.map((inner) => inner.properties?.explanation || inner.message)
      .join(" / ");
    throw new Error(details || error.message || String(error));
  }
}

function person(name, addressFull, phone) {
  return {
    name,
    nameKana: "",
    zip: "",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "",
    addressLine1: "",
    addressLine2: "",
    addressFull,
    addressNoPref: addressFull.replace(/^愛知県/u, ""),
    phone,
    fax: "",
    email: "",
    corporateNumber: "",
    representativeName: "",
  };
}

function parcel(chiban, chimoku, area) {
  return {
    pref: "愛知県",
    city: "豊橋市",
    aza: "大岩町字検証",
    chiban,
    locationFull: `豊橋市大岩町字検証${chiban}`,
    chimoku,
    area,
    tenyoArea: area,
  };
}

async function applyNewVersion(supabase, template, patchedBuffer, placeholders) {
  const nextVersion = Number(template.version ?? 1) + 1;
  const categorySlug = template.template_categories?.slug ?? "other";
  const storagePath = `${categorySlug}/${template.id}_v${nextVersion}.docx`;

  const { data: inserted, error: insertError } = await supabase
    .from("templates")
    .insert({
      name: template.name,
      category_id: template.category_id,
      municipality_id: template.municipality_id,
      file_path: "templates/_pending",
      file_type: "docx",
      original_file_name: template.original_file_name,
      version: nextVersion,
      is_active: true,
      description: template.description,
      applicable_case_types: template.applicable_case_types,
      uploaded_by_user_id: template.uploaded_by_user_id,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(`DB登録に失敗しました: ${insertError?.message}`);

  const finalStoragePath = `${categorySlug}/${inserted.id}_v${nextVersion}.docx`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET_TEMPLATES)
    .upload(finalStoragePath, patchedBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
  if (uploadError) {
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`Storage登録に失敗しました: ${uploadError.message}`);
  }

  const { error: updatePathError } = await supabase
    .from("templates")
    .update({ file_path: `${STORAGE_BUCKET_TEMPLATES}/${finalStoragePath}` })
    .eq("id", inserted.id);
  if (updatePathError) {
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([finalStoragePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`file_path更新に失敗しました: ${updatePathError.message}`);
  }

  const { error: deactivateError } = await supabase
    .from("templates")
    .update({ is_active: false })
    .eq("id", template.id);
  if (deactivateError) {
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([finalStoragePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`旧バージョン無効化に失敗しました: ${deactivateError.message}`);
  }

  const { error: mappingError } = await supabase.from("template_mappings").insert(
    placeholders.map((placeholder, index) => ({
      template_id: inserted.id,
      placeholder,
      field_path: placeholder,
      label: placeholder,
      is_required: false,
      sort_order: index,
    })),
  );
  if (mappingError) {
    await supabase.from("templates").update({ is_active: true }).eq("id", template.id);
    await supabase.storage.from(STORAGE_BUCKET_TEMPLATES).remove([finalStoragePath]);
    await supabase.from("templates").delete().eq("id", inserted.id);
    throw new Error(`マッピング登録に失敗しました: ${mappingError.message}`);
  }

  return inserted.id;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await fs.mkdir(path.join(projectRoot, OUTPUT_DIR), { recursive: true });

  const targetIds = [...Object.keys(TARGETS).map(Number), ...DEACTIVATE_REFERENCE_TEMPLATE_IDS];
  const { data: templates, error } = await supabase
    .from("templates")
    .select("*, template_categories(slug)")
    .in("id", targetIds)
    .order("id");
  if (error) throw new Error(`テンプレート取得に失敗しました: ${error.message}`);

  const byId = new Map((templates ?? []).map((template) => [template.id, template]));
  const results = [];

  for (const [rawId, config] of Object.entries(TARGETS)) {
    const id = Number(rawId);
    const template = byId.get(id);
    try {
      if (!template) throw new Error(`template#${id} が見つかりません。`);
      if (!template.is_active) {
        results.push({ id, name: template.name, skipped: "inactive" });
        continue;
      }

      const storagePath = String(template.file_path).replace(/^templates\//u, "");
      const { data: blob, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET_TEMPLATES)
        .download(storagePath);
      if (downloadError || !blob) throw new Error(`${template.name}: ダウンロードに失敗しました。`);

      const sourceBuffer = Buffer.from(await blob.arrayBuffer());
      const patchedBuffer = patchTemplateBuffer(sourceBuffer, config.patches);
      const placeholders = detectPlaceholders(patchedBuffer);
      if (placeholders.length === 0) throw new Error(`${template.name}: プレースホルダーがありません。`);
      const previewBuffer = renderPreview(patchedBuffer);

      const safeName = template.name.replace(/[^\p{L}\p{N}._-]+/gu, "_");
      const patchedPath = path.join(projectRoot, OUTPUT_DIR, `${id}_${safeName}_template.docx`);
      const previewPath = path.join(projectRoot, OUTPUT_DIR, `${id}_${safeName}_preview.docx`);
      await fs.writeFile(patchedPath, patchedBuffer);
      await fs.writeFile(previewPath, previewBuffer);

      let newTemplateId = null;
      if (options.apply) {
        newTemplateId = await applyNewVersion(supabase, template, patchedBuffer, placeholders);
      }

      results.push({
        id,
        name: template.name,
        placeholders: placeholders.length,
        newTemplateId,
        patchedPath: path.relative(projectRoot, patchedPath),
        previewPath: path.relative(projectRoot, previewPath),
      });
    } catch (error) {
      throw new Error(`${id} ${config.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (options.apply) {
    for (const id of DEACTIVATE_REFERENCE_TEMPLATE_IDS) {
      const template = byId.get(id);
      if (!template?.is_active) continue;
      const { error: deactivateError } = await supabase
        .from("templates")
        .update({ is_active: false })
        .eq("id", id);
      if (deactivateError) throw new Error(`${template.name}: 無効化に失敗しました。`);
      results.push({ id, name: template.name, deactivated: true });
    }
  } else {
    for (const id of DEACTIVATE_REFERENCE_TEMPLATE_IDS) {
      const template = byId.get(id);
      if (template?.is_active) results.push({ id, name: template.name, willDeactivate: true });
    }
  }

  console.log(JSON.stringify({ apply: options.apply, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
