#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";

const CATEGORY_CONFIG = new Map([
  [
    "土地改良区",
    { slug: "land_improvement", caseType: "land_improvement", sortOrder: 1 },
  ],
  [
    "境界確定測量",
    { slug: "boundary_survey", caseType: "boundary_survey", sortOrder: 2 },
  ],
  [
    "建築許可",
    { slug: "building_permit", caseType: "building_permit", sortOrder: 3 },
  ],
  [
    "農地転用許可",
    { slug: "farmland_conversion", caseType: "farmland_conversion", sortOrder: 4 },
  ],
  [
    "その他",
    { slug: "other", caseType: "other", sortOrder: 99 },
  ],
]);

const CATEGORY_INFERENCE_RULES = [
  {
    name: "土地改良区",
    pattern: /土地改良|地区除外|用水|受益地|農地転用等の通知/u,
  },
  {
    name: "境界確定測量",
    pattern: /境界|官民|査定|立会|確定図|筆界/u,
  },
  {
    name: "建築許可",
    pattern: /建築許可|開発許可|開発・建築|都市計画法|適合証明|60条/u,
  },
  {
    name: "農地転用許可",
    pattern: /農地法|農地転用|農振|農用地|5条|4条|3条|非農地/u,
  },
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

function printUsage() {
  console.log(`Usage: node scripts/import-templates.mjs [options]

Options:
  --dry-run           登録内容だけ確認して DB / Storage は更新しない
  --source-dir <dir>  取り込み元フォルダ（default: docs/様式）
  --category <name>   特定カテゴリのみ取り込む（例: 土地改良区）
  --match <text>      相対パスに text を含むファイルだけ取り込む
  --help              このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    sourceDir: path.join("docs", "様式"),
    category: null,
    match: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") continue;

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--source-dir") {
      options.sourceDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--category") {
      options.category = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--match") {
      options.match = argv[index + 1] ?? null;
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

  return options;
}

async function loadEnvFile(envPath) {
  let raw;
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

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
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

function normalizeLabel(value) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeKeyPart(value) {
  return normalizeLabel(value || "").toLowerCase();
}

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".docx" || ext === ".xlsx") {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "ja"));
}

function detectPlaceholdersInDocx(buffer) {
  const zip = new PizZip(buffer);
  const found = new Set();

  for (const targetPath of TARGET_XMLS) {
    const file = zip.file(targetPath);
    if (!file) continue;

    const xml = file.asText();
    const plain = xml.replace(/<[^>]+>/g, "");
    for (const match of plain.matchAll(/\{([^{}#/^][^{}]*)\}/g)) {
      const key = normalizeLabel(match[1] || "");
      if (key) found.add(key);
    }
  }

  return Array.from(found).sort((a, b) => a.localeCompare(b, "ja"));
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
    if (config && rule.pattern.test(text)) {
      return { name: rule.name, ...config };
    }
  }

  const fallback = CATEGORY_CONFIG.get("その他");
  if (!fallback) {
    throw new Error("カテゴリ未定義: その他");
  }
  return { name: "その他", ...fallback };
}

function buildPlanEntry(rootDir, fullPath) {
  const relativePath = path.relative(rootDir, fullPath);
  const pathParts = relativePath.split(path.sep);
  const categoryConfig = inferCategoryConfig(pathParts[0], relativePath);

  const originalFileName = pathParts[pathParts.length - 1];
  const fileType = path.extname(originalFileName).slice(1).toLowerCase();
  const baseName = path.basename(originalFileName, path.extname(originalFileName));
  const sourceLabels = pathParts.slice(1, -1).map(normalizeLabel).filter(Boolean);
  const municipalityCode = inferMunicipalityCode(
    [relativePath, ...sourceLabels, originalFileName].join(" "),
  );

  return {
    fullPath,
    relativePath: relativePath.split(path.sep).join("/"),
    categoryName: categoryConfig.name,
    categorySlug: categoryConfig.slug,
    caseType: categoryConfig.caseType,
    fileType,
    originalFileName,
    municipalityCode,
    name: buildTemplateName(baseName, sourceLabels),
    description:
      sourceLabels.length > 0
        ? `原本フォルダ: ${sourceLabels.join(" / ")} / 取込元: ${relativePath
            .split(path.sep)
            .join("/")}`
        : `取込元: ${relativePath.split(path.sep).join("/")}`,
  };
}

function buildTemplateKey(entry, categoryId) {
  return [
    categoryId,
    normalizeKeyPart(entry.name),
    normalizeKeyPart(entry.originalFileName),
    normalizeKeyPart(entry.fileType),
  ].join("|");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const projectRoot = process.cwd();
  const sourceRoot = path.resolve(projectRoot, options.sourceDir);

  const files = await collectFiles(sourceRoot);
  const plan = files
    .map((filePath) => buildPlanEntry(sourceRoot, filePath))
    .filter((entry) => !options.category || entry.categoryName === options.category)
    .filter((entry) => !options.match || entry.relativePath.includes(options.match));

  if (plan.length === 0) {
    console.log("対象ファイルが見つかりませんでした。");
    return;
  }

  if (options.dryRun) {
    console.log(`[dry-run] ${plan.length}件のテンプレートを確認します。`);
    for (const entry of plan) {
      console.log(
        `plan  ${entry.relativePath} -> ${entry.name}${entry.municipalityCode ? ` [${entry.municipalityCode}]` : ""}`,
      );
    }
    console.log("");
    console.log("Summary");
    console.log(`  planned: ${plan.length}`);
    console.log("  note: dry-run は DB / Storage に接続しません。既存重複は本登録時に確認します。");
    return;
  }

  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.STORAGE_BUCKET_TEMPLATES || "templates";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [categoriesRes, templatesRes, adminUserRes] = await Promise.all([
    supabase.from("template_categories").select("id, name, slug"),
    supabase
      .from("templates")
      .select("id, category_id, name, original_file_name, file_type, version, is_active"),
    supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)
      .limit(1),
  ]);

  if (categoriesRes.error) throw new Error(`カテゴリ取得に失敗しました: ${categoriesRes.error.message}`);
  if (templatesRes.error) throw new Error(`既存テンプレート取得に失敗しました: ${templatesRes.error.message}`);
  if (adminUserRes.error) throw new Error(`管理者ユーザー取得に失敗しました: ${adminUserRes.error.message}`);

  const { data: municipalities, error: municipalitiesError } = await supabase
    .from("location_municipalities")
    .select("id, code");
  if (municipalitiesError) {
    throw new Error(`市町村マスタ取得に失敗しました: ${municipalitiesError.message}`);
  }

  const categories = [...(categoriesRes.data ?? [])];
  const missingCategories = [...CATEGORY_CONFIG.entries()]
    .filter(([, config]) => !categories.some((category) => category.slug === config.slug))
    .map(([name, config]) => ({
      name,
      slug: config.slug,
      sort_order: config.sortOrder,
    }));

  if (missingCategories.length > 0) {
    const { data: insertedCategories, error: insertCategoriesError } = await supabase
      .from("template_categories")
      .insert(missingCategories)
      .select("id, name, slug");

    if (insertCategoriesError) {
      throw new Error(`カテゴリ自動作成に失敗しました: ${insertCategoriesError.message}`);
    }

    categories.push(...(insertedCategories ?? []));
  }

  const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const municipalityIdByCode = new Map(
    (municipalities ?? []).map((municipality) => [municipality.code, municipality.id]),
  );
  const uploadedByUserId = adminUserRes.data?.[0]?.id ?? null;

  const existingByKey = new Map();
  for (const template of templatesRes.data ?? []) {
    const key = [
      template.category_id,
      normalizeKeyPart(template.name),
      normalizeKeyPart(template.original_file_name || ""),
      normalizeKeyPart(template.file_type),
    ].join("|");

    if (!existingByKey.has(key)) {
      existingByKey.set(key, template);
    }
  }

  let createdCount = 0;
  let skippedCount = 0;
  let mappingCount = 0;
  const failures = [];

  console.log(
    `${options.dryRun ? "[dry-run] " : ""}${plan.length}件のテンプレートを確認します。`,
  );

  for (const entry of plan) {
    const categoryId = categoryIdBySlug.get(entry.categorySlug);
    if (!categoryId) {
      failures.push(`${entry.relativePath}: category slug "${entry.categorySlug}" が未登録`);
      continue;
    }

    const templateKey = buildTemplateKey(entry, categoryId);
    const existing = existingByKey.get(templateKey);
    if (existing) {
      skippedCount += 1;
      console.log(
        `skip  ${entry.relativePath} -> template#${existing.id} v${existing.version} (${existing.is_active ? "active" : "inactive"})`,
      );
      continue;
    }

    if (options.dryRun) {
      createdCount += 1;
      console.log(
        `plan  ${entry.relativePath} -> ${entry.name}${entry.municipalityCode ? ` [${entry.municipalityCode}]` : ""}`,
      );
      continue;
    }

    const fileBuffer = await fs.readFile(entry.fullPath);
    const municipalityId = entry.municipalityCode
      ? municipalityIdByCode.get(entry.municipalityCode) ?? null
      : null;
    const { data: inserted, error: insertError } = await supabase
      .from("templates")
      .insert({
        category_id: categoryId,
        name: entry.name,
        description: entry.description,
        file_type: entry.fileType,
        file_path: "templates/_pending",
        original_file_name: entry.originalFileName,
        version: 1,
        is_active: true,
        municipality_id: municipalityId,
        applicable_case_types: [entry.caseType],
        uploaded_by_user_id: uploadedByUserId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      failures.push(`${entry.relativePath}: DB insert failed (${insertError?.message || "unknown"})`);
      continue;
    }

    const storagePath = `${entry.categorySlug}/${inserted.id}_v1.${entry.fileType}`;
    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
      contentType: MIME_TYPES[entry.fileType] || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      await supabase.from("templates").delete().eq("id", inserted.id);
      failures.push(`${entry.relativePath}: storage upload failed (${uploadError.message})`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("templates")
      .update({ file_path: `${bucketName}/${storagePath}` })
      .eq("id", inserted.id);

    if (updateError) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      await supabase.from("templates").delete().eq("id", inserted.id);
      failures.push(`${entry.relativePath}: file_path update failed (${updateError.message})`);
      continue;
    }

    if (entry.fileType === "docx") {
      const placeholders = detectPlaceholdersInDocx(fileBuffer);
      if (placeholders.length > 0) {
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
          await supabase.storage.from(bucketName).remove([storagePath]);
          await supabase.from("templates").delete().eq("id", inserted.id);
          failures.push(`${entry.relativePath}: mapping insert failed (${mappingsError.message})`);
          continue;
        }

        mappingCount += placeholders.length;
      }
    }

    existingByKey.set(templateKey, {
      id: inserted.id,
      category_id: categoryId,
      name: entry.name,
      original_file_name: entry.originalFileName,
      file_type: entry.fileType,
      version: 1,
      is_active: true,
    });

    createdCount += 1;
    console.log(`done  ${entry.relativePath} -> template#${inserted.id}`);
  }

  console.log("");
  console.log("Summary");
  console.log(`  created:  ${createdCount}`);
  console.log(`  skipped:  ${skippedCount}`);
  console.log(`  mappings: ${mappingCount}`);
  console.log(`  failed:   ${failures.length}`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failures");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
