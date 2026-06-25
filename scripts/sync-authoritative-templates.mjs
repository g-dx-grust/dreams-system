#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";

const DEFAULT_SOURCE_DIR = "docs/template-intake/20260626-authoritative";
const DEFAULT_PREPARED_JSON = "tmp/template-intake-20260626-authoritative/prepared-files.json";
const DEFAULT_REPORT_DIR = "tmp/template-intake-20260626-authoritative";
const AUTHORITATIVE_SYNC_LABEL = "authoritative-20260626";

const CATEGORY_CONFIG = new Map([
  ["土地改良区", { slug: "land_improvement", caseType: "land_improvement", sortOrder: 1 }],
  ["境界確定測量", { slug: "boundary_survey", caseType: "boundary_survey", sortOrder: 2 }],
  ["建築許可", { slug: "building_permit", caseType: "building_permit", sortOrder: 3 }],
  ["農地転用許可", { slug: "farmland_conversion", caseType: "farmland_conversion", sortOrder: 4 }],
  ["その他", { slug: "other", caseType: "other", sortOrder: 99 }],
]);

const CATEGORY_INFERENCE_RULES = [
  { name: "土地改良区", pattern: /土地改良|地区除外|用水|受益地|農地転用等の通知/u },
  { name: "境界確定測量", pattern: /境界|官民|査定|立会|確定図|筆界/u },
  { name: "建築許可", pattern: /建築許可|開発許可|開発・建築|都市計画法|適合証明|60条/u },
  { name: "農地転用許可", pattern: /農地法|農地転用|農振|農用地|5条|4条|3条|非農地/u },
];

const MUNICIPALITY_CODE_RULES = [
  { pattern: /豊橋/u, code: "toyohashi_city" },
  { pattern: /豊川/u, code: "toyokawa_city" },
  { pattern: /蒲郡/u, code: "gamagori_city" },
  { pattern: /新城/u, code: "shinshiro_city" },
  { pattern: /田原/u, code: "tahara_city" },
  { pattern: /設楽/u, code: "shitara_town" },
  { pattern: /東栄/u, code: "toei_town" },
  { pattern: /豊根/u, code: "toyone_village" },
  { pattern: /浜松/u, code: "hamamatsu_city" },
  { pattern: /湖西/u, code: "kosai_city" },
];

const TARGET_XMLS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

const MIME_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function printUsage() {
  console.log(`Usage: node scripts/sync-authoritative-templates.mjs [options]

Options:
  --apply                  Supabase DB / Storage に反映する（既定はdry-run）
  --source-dir <dir>       取込用ディレクトリ（default: ${DEFAULT_SOURCE_DIR}）
  --prepared-json <path>   変換レポートJSON（default: ${DEFAULT_PREPARED_JSON}）
  --report-dir <dir>       同期レポート出力先（default: ${DEFAULT_REPORT_DIR}）
  --help                   このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    sourceDir: DEFAULT_SOURCE_DIR,
    preparedJson: DEFAULT_PREPARED_JSON,
    reportDir: DEFAULT_REPORT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--source-dir") {
      options.sourceDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--prepared-json") {
      options.preparedJson = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--report-dir") {
      options.reportDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.sourceDir) throw new Error("--source-dir を指定してください。");
  if (!options.preparedJson) throw new Error("--prepared-json を指定してください。");
  if (!options.reportDir) throw new Error("--report-dir を指定してください。");
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

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "README.md") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".docx" || ext === ".xlsx") files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b, "ja"));
}

function normalizeLabel(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeSegment(value) {
  return normalizeLabel(value).replace(/^●+/u, "");
}

function normalizeLookup(value) {
  return normalizeSegment(value)
    .replace(/\.[^.]+$/u, "")
    .replace(/\((?:\d+)\)$/u, "")
    .replace(/（(?:\d+)）$/u, "")
    .replace(/[ 　・:：]/gu, "")
    .toLowerCase();
}

function normalizeMappingLookup(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\{\{?/u, "")
    .replace(/\}\}?$/u, "")
    .replace(/\s+/gu, "");
}

function canonicalizeFieldPath(value) {
  return normalizeMappingLookup(value);
}

function buildTemplateName(baseName, sourceLabels) {
  const cleanedBaseName = normalizeLabel(baseName);
  if (sourceLabels.length === 0) return cleanedBaseName;
  return `${cleanedBaseName}（${sourceLabels.map(normalizeLabel).join(" / ")}）`;
}

function inferMunicipalityCode(text) {
  for (const rule of MUNICIPALITY_CODE_RULES) {
    if (rule.pattern.test(text)) return rule.code;
  }
  return null;
}

function inferCategoryConfig(categoryName, relativePath) {
  const direct = CATEGORY_CONFIG.get(categoryName);
  if (direct) return { name: categoryName, ...direct };

  const text = normalizeLabel(relativePath);
  for (const rule of CATEGORY_INFERENCE_RULES) {
    const config = CATEGORY_CONFIG.get(rule.name);
    if (config && rule.pattern.test(text)) return { name: rule.name, ...config };
  }

  const fallback = CATEGORY_CONFIG.get("その他");
  if (!fallback) throw new Error("カテゴリ未定義: その他");
  return { name: "その他", ...fallback };
}

function buildPlanEntry(rootDir, fullPath, preparedLookup) {
  const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
  const pathParts = relativePath.split("/");
  const categoryConfig = inferCategoryConfig(pathParts[0], relativePath);
  const originalFileName = pathParts.at(-1) ?? "";
  const ext = path.extname(originalFileName).slice(1).toLowerCase();
  const baseName = normalizeLabel(path.basename(originalFileName, path.extname(originalFileName)));
  const sourceLabels = pathParts.slice(1, -1).map(normalizeLabel).filter(Boolean);
  const sourceLabelLookups = sourceLabels.map(normalizeLookup).filter((label) => label.length >= 3);
  const municipalityCode = inferMunicipalityCode([relativePath, ...sourceLabels, originalFileName].join(" "));
  const prepared = preparedLookup.get(relativePath) ?? null;

  return {
    fullPath,
    relativePath,
    categoryName: categoryConfig.name,
    categorySlug: categoryConfig.slug,
    caseType: categoryConfig.caseType,
    fileType: ext,
    originalFileName,
    sourceOriginalPath: prepared?.sourcePath ?? relativePath,
    sourceExt: prepared?.sourceExt ?? `.${ext}`,
    conversionAction: prepared?.action ?? "unknown",
    pageCountStatus: prepared?.pageCountStatus ?? "",
    placeholderCount: prepared?.placeholderCount ?? "",
    municipalityCode,
    name: buildTemplateName(baseName, sourceLabels),
    matchStem: normalizeLookup(baseName),
    sourceLabels,
    sourceLabelLookups,
    primaryContextLookup: sourceLabelLookups.at(-1) ?? "",
    description:
      `${AUTHORITATIVE_SYNC_LABEL} / 正本: ${prepared?.sourcePath ?? relativePath} / ` +
      `取込元: ${relativePath}`,
  };
}

function detectPlaceholdersInDocx(buffer) {
  const zip = new PizZip(buffer);
  const found = new Set();

  for (const targetPath of TARGET_XMLS) {
    const file = zip.file(targetPath);
    if (!file) continue;
    const plain = file.asText().replace(/<[^>]+>/g, "");
    for (const match of plain.matchAll(/\{([^{}#/^][^{}]*)\}/g)) {
      const key = normalizeLabel(match[1] || "");
      if (key) found.add(key);
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b, "ja"));
}

function mappingCount(template) {
  return Array.isArray(template.template_mappings) ? template.template_mappings.length : 0;
}

function templateCategorySlug(template) {
  const relation = template.template_categories;
  if (Array.isArray(relation)) return relation[0]?.slug ?? "";
  return relation?.slug ?? "";
}

function templateMatchStem(template) {
  const fromOriginal = normalizeLookup(template.original_file_name || "");
  if (fromOriginal) return fromOriginal;
  return normalizeLookup(String(template.name || "").replace(/（[^）]+）$/u, ""));
}

function scoreTemplateMatch(entry, template, municipalityId) {
  if (template.file_type !== entry.fileType) return 0;
  const categorySlug = templateCategorySlug(template);
  if (categorySlug !== entry.categorySlug) return 0;

  let score = 20;
  const existingStem = templateMatchStem(template);
  if (existingStem === entry.matchStem) score += 60;
  else if (existingStem.includes(entry.matchStem) || entry.matchStem.includes(existingStem)) score += 35;
  else return 0;

  if (template.municipality_id && municipalityId && template.municipality_id !== municipalityId) return 0;
  const municipalityMatches = Boolean(
    template.municipality_id && municipalityId && template.municipality_id === municipalityId,
  );
  if (municipalityMatches) score += 15;
  if (!template.municipality_id && !municipalityId) score += 5;

  const existingContext = normalizeLookup(
    [template.name, template.description, template.original_file_name, template.file_path].join(" "),
  );
  const primaryContextMatches = Boolean(
    entry.primaryContextLookup && existingContext.includes(entry.primaryContextLookup),
  );
  const contextMatches =
    primaryContextMatches || entry.sourceLabelLookups.some((label) => existingContext.includes(label));
  const hasSpecificContext = entry.sourceLabelLookups.length > 1;
  const requiresExactJurisdiction = /土地改良区|用水/u.test(entry.primaryContextLookup);

  if (requiresExactJurisdiction && !primaryContextMatches) return 0;
  if (existingStem !== entry.matchStem && hasSpecificContext && !municipalityMatches && !primaryContextMatches) {
    return 0;
  }
  if (entry.duplicateStem && !municipalityMatches && !primaryContextMatches) return 0;
  if (contextMatches) score += 20;

  if (template.is_active) score += 8;
  if (mappingCount(template) > 0) score += 5;
  score += Math.min(Number(template.version ?? 1), 10);
  return score;
}

function findBestTemplateMatch(entry, templates, municipalityId) {
  const candidates = templates
    .map((template) => ({ template, score: scoreTemplateMatch(entry, template, municipalityId) }))
    .filter((candidate) => candidate.score >= 80)
    .sort((a, b) => b.score - a.score || Number(b.template.version ?? 0) - Number(a.template.version ?? 0));
  return candidates[0] ?? null;
}

function buildDetectedMappings(templateId, placeholders, existingMappings = []) {
  const existingByPlaceholder = new Map(existingMappings.map((mapping) => [mapping.placeholder, mapping]));
  const existingByCanonicalPlaceholder = new Map(
    existingMappings.map((mapping) => [normalizeMappingLookup(mapping.placeholder), mapping]),
  );

  return placeholders.map((placeholder, index) => {
    const preserved =
      existingByPlaceholder.get(placeholder) ?? existingByCanonicalPlaceholder.get(normalizeMappingLookup(placeholder));
    const fieldPath = preserved?.field_path ?? placeholder;
    return {
      template_id: templateId,
      placeholder,
      field_path: canonicalizeFieldPath(fieldPath),
      label: preserved?.label ?? canonicalizeFieldPath(fieldPath),
      is_required: preserved?.is_required ?? false,
      sort_order: index,
    };
  });
}

function copyExistingMappings(templateId, existingMappings = []) {
  return existingMappings.map((mapping, index) => ({
    template_id: templateId,
    placeholder: mapping.placeholder,
    field_path: canonicalizeFieldPath(mapping.field_path || mapping.placeholder),
    label: mapping.label ?? canonicalizeFieldPath(mapping.field_path || mapping.placeholder),
    is_required: mapping.is_required ?? false,
    sort_order: index,
  }));
}

async function ensureCategories(supabase) {
  const { data, error } = await supabase.from("template_categories").select("id, name, slug");
  if (error) throw new Error(`カテゴリ取得に失敗しました: ${error.message}`);

  const categories = [...(data ?? [])];
  const missing = [...CATEGORY_CONFIG.entries()]
    .filter(([, config]) => !categories.some((category) => category.slug === config.slug))
    .map(([name, config]) => ({ name, slug: config.slug, sort_order: config.sortOrder }));

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("template_categories")
      .insert(missing)
      .select("id, name, slug");
    if (insertError) throw new Error(`カテゴリ自動作成に失敗しました: ${insertError.message}`);
    categories.push(...(inserted ?? []));
  }

  return categories;
}

async function fetchReferenceData(supabase) {
  const [categories, municipalitiesRes, templatesRes, adminUserRes] = await Promise.all([
    ensureCategories(supabase),
    supabase.from("location_municipalities").select("id, code"),
    supabase
      .from("templates")
      .select(
        "id, category_id, municipality_id, name, original_file_name, file_type, file_path, version, is_active, description, applicable_case_types, uploaded_by_user_id, template_categories(slug, name), template_mappings(id, placeholder, field_path, label, is_required, sort_order)",
      ),
    supabase.from("users").select("id").eq("role", "admin").eq("is_active", true).limit(1),
  ]);

  if (municipalitiesRes.error) throw new Error(`市町村マスタ取得に失敗しました: ${municipalitiesRes.error.message}`);
  if (templatesRes.error) throw new Error(`既存テンプレート取得に失敗しました: ${templatesRes.error.message}`);
  if (adminUserRes.error) throw new Error(`管理者ユーザー取得に失敗しました: ${adminUserRes.error.message}`);

  return {
    categories,
    municipalityIdByCode: new Map((municipalitiesRes.data ?? []).map((row) => [row.code, row.id])),
    templates: templatesRes.data ?? [],
    uploadedByUserId: adminUserRes.data?.[0]?.id ?? null,
  };
}

async function insertAudit(supabase, userId, entityId, detail) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "template.upload",
    entity_type: "template",
    entity_id: entityId,
    detail,
  });
  if (error) {
    console.error(`audit log failed for template#${entityId}: ${error.message}`);
  }
}

async function buildPlan({ sourceRoot, preparedJson, supabase }) {
  const preparedRows = JSON.parse(await fs.readFile(preparedJson, "utf8"));
  const preparedLookup = new Map(preparedRows.map((row) => [row.outputPath.replace(/^docs\/template-intake\/20260626-authoritative\//u, ""), row]));
  const files = await collectFiles(sourceRoot);
  const referenceData = await fetchReferenceData(supabase);
  const categoryIdBySlug = new Map(referenceData.categories.map((category) => [category.slug, category.id]));

  const entries = files.map((file) => buildPlanEntry(sourceRoot, file, preparedLookup));
  const duplicateCounts = new Map();
  for (const entry of entries) {
    const key = [entry.categorySlug, entry.fileType, entry.matchStem].join("|");
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const duplicateKey = [entry.categorySlug, entry.fileType, entry.matchStem].join("|");
    entry.duplicateStem = (duplicateCounts.get(duplicateKey) ?? 0) > 1;
    const categoryId = categoryIdBySlug.get(entry.categorySlug);
    const municipalityId = entry.municipalityCode
      ? referenceData.municipalityIdByCode.get(entry.municipalityCode) ?? null
      : null;
    const match = findBestTemplateMatch(entry, referenceData.templates, municipalityId);
    const oldMappings = match?.template?.template_mappings ?? [];
    const nextVersion = match ? Number(match.template.version ?? 1) + 1 : 1;
    const mappingPlan =
      entry.fileType === "xlsx"
        ? oldMappings.length > 0
          ? "copy_existing_xlsx_mappings"
          : "needs_xlsx_mapping"
        : "detect_docx_placeholders";

    return {
      ...entry,
      categoryId,
      municipalityId,
      matchedTemplateId: match?.template.id ?? null,
      matchedTemplateName: match?.template.name ?? null,
      matchedTemplateVersion: match?.template.version ?? null,
      matchedTemplateActive: match?.template.is_active ?? null,
      existingMappingCount: oldMappings.length,
      nextVersion,
      mappingPlan,
      syncAction: match ? "new_version" : "new_template",
      status: categoryId ? "planned" : "missing_category",
    };
  });
}

async function applyPlan({ supabase, bucket, uploadedByUserId, plan, existingTemplates }) {
  const results = [];

  for (let index = 0; index < plan.length; index += 1) {
    const entry = plan[index];
    const row = {
      index: index + 1,
      relativePath: entry.relativePath,
      syncAction: entry.syncAction,
      status: "skipped",
      templateId: "",
      previousTemplateId: entry.matchedTemplateId ?? "",
      version: entry.nextVersion,
      mappingCount: 0,
      deactivatedIds: "",
      storagePath: "",
      error: "",
    };

    if (entry.status !== "planned") {
      row.status = entry.status;
      results.push(row);
      continue;
    }

    const matched = entry.matchedTemplateId
      ? existingTemplates.find((template) => template.id === entry.matchedTemplateId)
      : null;
    const oldMappings = matched?.template_mappings ?? [];
    const name = matched?.name ?? entry.name;
    const description = matched?.description
      ? `${matched.description}\n${entry.description}`
      : entry.description;

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("templates")
        .insert({
          category_id: entry.categoryId,
          name,
          description,
          file_type: entry.fileType,
          file_path: "templates/_pending",
          original_file_name: entry.originalFileName,
          version: entry.nextVersion,
          is_active: false,
          municipality_id: entry.municipalityId,
          applicable_case_types: (matched?.applicable_case_types ?? [entry.caseType]),
          uploaded_by_user_id: uploadedByUserId,
        })
        .select("id")
        .single();

      if (insertError || !inserted) throw new Error(`DB insert failed: ${insertError?.message ?? "unknown"}`);

      row.templateId = inserted.id;
      const storagePath = `${entry.categorySlug}/${inserted.id}_v${entry.nextVersion}.${entry.fileType}`;
      row.storagePath = `${bucket}/${storagePath}`;
      const fileBuffer = await fs.readFile(entry.fullPath);
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
        contentType: MIME_TYPES[entry.fileType] || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

      const { error: pathUpdateError } = await supabase
        .from("templates")
        .update({ file_path: `${bucket}/${storagePath}` })
        .eq("id", inserted.id);
      if (pathUpdateError) throw new Error(`file_path update failed: ${pathUpdateError.message}`);

      let mappingRows = [];
      if (entry.fileType === "docx") {
        const placeholders = detectPlaceholdersInDocx(fileBuffer);
        mappingRows = placeholders.length > 0 ? buildDetectedMappings(inserted.id, placeholders, oldMappings) : [];
      } else if (oldMappings.length > 0) {
        mappingRows = copyExistingMappings(inserted.id, oldMappings);
      }

      if (mappingRows.length > 0) {
        const { error: mappingError } = await supabase.from("template_mappings").insert(mappingRows);
        if (mappingError) throw new Error(`mapping insert failed: ${mappingError.message}`);
      }
      row.mappingCount = mappingRows.length;

      const { error: activateError } = await supabase
        .from("templates")
        .update({ is_active: true })
        .eq("id", inserted.id);
      if (activateError) throw new Error(`new template activate failed: ${activateError.message}`);

      const deactivatedIds = [];
      if (matched?.is_active) {
        const { error: deactivateError } = await supabase
          .from("templates")
          .update({ is_active: false })
          .eq("id", matched.id);
        if (deactivateError) throw new Error(`old template deactivate failed: ${deactivateError.message}`);
        deactivatedIds.push(matched.id);
      }
      row.deactivatedIds = deactivatedIds.join("|");

      await insertAudit(supabase, uploadedByUserId, inserted.id, {
        syncLabel: AUTHORITATIVE_SYNC_LABEL,
        sourcePath: entry.sourceOriginalPath,
        intakePath: entry.relativePath,
        previousTemplateId: matched?.id ?? null,
        version: entry.nextVersion,
        mappingCount: mappingRows.length,
      });

      row.status = "done";
    } catch (error) {
      row.status = "failed";
      row.error = error instanceof Error ? error.message : String(error);
    }

    results.push(row);
    if ((index + 1) % 25 === 0 || index + 1 === plan.length) {
      console.log(`${entry.syncAction} ${index + 1}/${plan.length}`);
    }
  }

  return results;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/u.test(text)) return text;
  return `"${text.replace(/"/gu, '""')}"`;
}

function toCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
}

function summarize(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] ?? "(blank)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ja")));
}

async function writeReports({ reportDir, plan, results, apply }) {
  await fs.mkdir(reportDir, { recursive: true });
  const planPath = path.join(reportDir, "authoritative-sync-plan.json");
  const planCsvPath = path.join(reportDir, "authoritative-sync-plan.csv");
  const resultPath = path.join(reportDir, "authoritative-sync-result.json");
  const resultCsvPath = path.join(reportDir, "authoritative-sync-result.csv");

  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await fs.writeFile(
    planCsvPath,
    `${toCsv(plan, [
      "relativePath",
      "syncAction",
      "name",
      "categorySlug",
      "fileType",
      "municipalityCode",
      "matchedTemplateId",
      "matchedTemplateName",
      "matchedTemplateVersion",
      "existingMappingCount",
      "nextVersion",
      "mappingPlan",
      "status",
    ])}\n`,
    "utf8",
  );

  if (results) {
    await fs.writeFile(resultPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
    await fs.writeFile(
      resultCsvPath,
      `${toCsv(results, [
        "index",
        "relativePath",
        "syncAction",
        "status",
        "templateId",
        "previousTemplateId",
        "version",
        "mappingCount",
        "deactivatedIds",
        "storagePath",
        "error",
      ])}\n`,
      "utf8",
    );
  }

  console.log("");
  console.log("Summary");
  console.log(`  mode:        ${apply ? "apply" : "dry-run"}`);
  console.log(`  planned:     ${plan.length}`);
  console.log(`  actions:     ${JSON.stringify(summarize(plan, "syncAction"))}`);
  console.log(`  mappings:    ${JSON.stringify(summarize(plan, "mappingPlan"))}`);
  if (results) {
    console.log(`  results:     ${JSON.stringify(summarize(results, "status"))}`);
    console.log(`  deactivated: ${results.filter((row) => row.deactivatedIds).length}`);
  }
  console.log(`  plan:        ${planCsvPath}`);
  if (results) console.log(`  result:      ${resultCsvPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.STORAGE_BUCKET_TEMPLATES || "templates";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sourceRoot = path.resolve(projectRoot, options.sourceDir);
  const preparedJson = path.resolve(projectRoot, options.preparedJson);
  const reportDir = path.resolve(projectRoot, options.reportDir);
  const plan = await buildPlan({ sourceRoot, preparedJson, supabase });

  let results = null;
  if (options.apply) {
    const referenceData = await fetchReferenceData(supabase);
    results = await applyPlan({
      supabase,
      bucket,
      uploadedByUserId: referenceData.uploadedByUserId,
      plan,
      existingTemplates: referenceData.templates,
    });
    if (results.some((row) => row.status === "failed")) process.exitCode = 1;
  }

  await writeReports({ reportDir, plan, results, apply: options.apply });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
