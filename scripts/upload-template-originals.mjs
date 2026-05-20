#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SOURCES = ["docs/05申請様式", "docs/様式"];
const RESUMABLE_THRESHOLD_BYTES = 50 * 1024 * 1024;
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const MULTIPART_THRESHOLD_BYTES = 45 * 1024 * 1024;
const MULTIPART_CHUNK_SIZE = 40 * 1024 * 1024;

const MIME_TYPES = new Map([
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".jtd", "application/octet-stream"],
  [".pdf", "application/pdf"],
  [".rtf", "application/rtf"],
  [".txt", "text/plain; charset=utf-8"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".xdw", "application/octet-stream"],
]);

function printUsage() {
  console.log(`Usage: node scripts/upload-template-originals.mjs [options]

Options:
  --dry-run             アップロードせず、対象ファイルだけ確認する
  --source <path>       取込元フォルダ。複数指定可（既定: docs/05申請様式, docs/様式）
  --bucket <name>       Storage バケット名（既定: STORAGE_BUCKET_TEMPLATES または templates）
  --prefix <path>       Storage 内の保存先 prefix（既定: originals）
  --match <text>        元ファイルパスに text を含むファイルだけ対象にする
  --concurrency <n>     同時アップロード数（既定: 4）
  --verify              アップロード後に全ファイルをダウンロードして SHA-256 を照合する
  --help                このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    sources: [],
    bucket: null,
    prefix: "originals",
    match: null,
    concurrency: 4,
    verify: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--verify") {
      options.verify = true;
      continue;
    }

    if (arg === "--source") {
      options.sources.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--bucket") {
      options.bucket = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--prefix") {
      options.prefix = argv[index + 1] || "originals";
      index += 1;
      continue;
    }

    if (arg === "--match") {
      options.match = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = Number(argv[index + 1] || "4");
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.sources.length === 0) options.sources = DEFAULT_SOURCES;
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency は 1 以上の整数で指定してください。");
  }

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

async function collectFiles(sourceRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(sourceRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (entry.name === ".DS_Store") continue;
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b, "ja"));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function toStoragePath(prefix, sourceRoot, fullPath) {
  const sourceLabel = path.basename(sourceRoot);
  const relativeParts = path.relative(sourceRoot, fullPath).split(path.sep);
  const encodeSegment = (segment) =>
    Buffer.from(segment.normalize("NFC"), "utf8").toString("base64url");

  return [prefix, "by-path", encodeSegment(sourceLabel), ...relativeParts.map(encodeSegment)]
    .filter(Boolean)
    .join("/");
}

function getContentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function buildResumableEndpoints(supabaseUrl) {
  const parsed = new URL(supabaseUrl);
  const projectId = parsed.hostname.split(".")[0];
  const directStorageUrl = `${parsed.protocol}//${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  const standardUrl = `${parsed.origin}/storage/v1/upload/resumable`;
  return Array.from(new Set([directStorageUrl, standardUrl]));
}

function tusMetadataValue(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function buildTusMetadata(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${tusMetadataValue(value)}`)
    .join(",");
}

function summarizeByExtension(files) {
  const counts = new Map();
  for (const file of files) {
    const ext = path.extname(file.fullPath).toLowerCase() || "(no extension)";
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

async function uploadResumable({ endpoints, serviceRoleKey, bucket, file, buffer, contentType }) {
  const metadata = buildTusMetadata({
    bucketName: bucket,
    objectName: file.storagePath,
    contentType,
    cacheControl: "3600",
  });
  let lastError = null;

  for (const endpoint of endpoints) {
    let uploadUrl;
    try {
      const createResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "tus-resumable": "1.0.0",
          "upload-length": String(buffer.length),
          "upload-metadata": metadata,
          "x-upsert": "true",
        },
      });

      if (!createResponse.ok) {
        const body = await createResponse.text().catch(() => "");
        throw new Error(`TUS create failed ${createResponse.status}: ${body || createResponse.statusText}`);
      }

      const location = createResponse.headers.get("location");
      if (!location) throw new Error("TUS create did not return Location header");
      uploadUrl = new URL(location, endpoint).toString();

      let offset = 0;
      while (offset < buffer.length) {
        const end = Math.min(offset + TUS_CHUNK_SIZE, buffer.length);
        const chunk = buffer.subarray(offset, end);
        const patchResponse = await fetch(uploadUrl, {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "content-type": "application/offset+octet-stream",
            "tus-resumable": "1.0.0",
            "upload-offset": String(offset),
          },
          body: chunk,
        });

        if (!patchResponse.ok) {
          const body = await patchResponse.text().catch(() => "");
          throw new Error(`TUS patch failed ${patchResponse.status}: ${body || patchResponse.statusText}`);
        }

        const nextOffset = Number(patchResponse.headers.get("upload-offset"));
        offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : end;
      }

      return null;
    } catch (error) {
      lastError = error;
    }
  }

  return lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function uploadObjectWithRetry(supabase, bucket, storagePath, buffer, contentType) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      cacheControl: "3600",
      contentType,
      upsert: true,
    });
    if (!error) return null;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  return lastError;
}

async function uploadMultipart(supabase, bucket, file, buffer, contentType) {
  const parts = [];

  for (let offset = 0; offset < buffer.length; offset += MULTIPART_CHUNK_SIZE) {
    const partIndex = parts.length + 1;
    const chunk = buffer.subarray(offset, Math.min(offset + MULTIPART_CHUNK_SIZE, buffer.length));
    const partPath = `${file.storagePath}.parts/part-${String(partIndex).padStart(5, "0")}`;
    const partError = await uploadObjectWithRetry(
      supabase,
      bucket,
      partPath,
      chunk,
      "application/octet-stream",
    );
    if (partError) return { error: partError, storageMode: "multipart", parts };

    parts.push({
      index: partIndex,
      storagePath: partPath,
      size: chunk.length,
      sha256: sha256(chunk),
    });
  }

  const descriptorPath = `${file.storagePath}.multipart.json`;
  const descriptor = Buffer.from(
    `${JSON.stringify(
      {
        storageMode: "multipart",
        originalStoragePath: file.storagePath,
        originalSize: buffer.length,
        originalSha256: sha256(buffer),
        contentType,
        partSize: MULTIPART_CHUNK_SIZE,
        parts,
      },
      null,
      2,
    )}\n`,
  );
  const descriptorError = await uploadObjectWithRetry(
    supabase,
    bucket,
    descriptorPath,
    descriptor,
    "application/json",
  );
  if (descriptorError) return { error: descriptorError, storageMode: "multipart", parts };

  return { error: null, storageMode: "multipart", parts, descriptorPath };
}

async function uploadWithRetry(supabase, bucket, file, buffer, contentType, auth) {
  if (buffer.length > MULTIPART_THRESHOLD_BYTES) {
    return uploadMultipart(supabase, bucket, file, buffer, contentType);
  }

  if (buffer.length > RESUMABLE_THRESHOLD_BYTES) {
    const error = await uploadResumable({
      endpoints: auth.resumableEndpoints,
      serviceRoleKey: auth.serviceRoleKey,
      bucket,
      file,
      buffer,
      contentType,
    });
    return { error, storageMode: error ? "resumable_failed" : "single", parts: [] };
  }

  const error = await uploadObjectWithRetry(supabase, bucket, file.storagePath, buffer, contentType);
  return { error, storageMode: "single", parts: [] };
}

async function verifyDownloadedFile(supabase, bucket, file) {
  if (file.storageMode === "multipart") {
    const chunks = [];
    for (const part of file.parts ?? []) {
      const { data, error } = await supabase.storage.from(bucket).download(part.storagePath);
      if (error || !data) {
        return { ok: false, error: error?.message || `part download failed: ${part.storagePath}` };
      }

      const downloadedPart = Buffer.from(await data.arrayBuffer());
      if (downloadedPart.length !== part.size || sha256(downloadedPart) !== part.sha256) {
        return { ok: false, error: `part hash/size mismatch: ${part.storagePath}` };
      }
      chunks.push(downloadedPart);
    }

    const reconstructed = Buffer.concat(chunks);
    if (reconstructed.length !== file.size || sha256(reconstructed) !== file.sha256) {
      return { ok: false, error: `multipart reconstruction mismatch: ${file.storagePath}` };
    }

    return { ok: true };
  }

  const { data, error } = await supabase.storage.from(bucket).download(file.storagePath);
  if (error || !data) {
    return { ok: false, error: error?.message || "download failed" };
  }

  const downloaded = Buffer.from(await data.arrayBuffer());
  const downloadedHash = sha256(downloaded);
  if (downloaded.length !== file.size || downloadedHash !== file.sha256) {
    return {
      ok: false,
      error: `hash/size mismatch local=${file.size}:${file.sha256} remote=${downloaded.length}:${downloadedHash}`,
    };
  }

  return { ok: true };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = options.bucket || process.env.STORAGE_BUCKET_TEMPLATES || "templates";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const uploadAuth = {
    serviceRoleKey,
    resumableEndpoints: buildResumableEndpoints(supabaseUrl),
  };

  const files = [];
  for (const source of options.sources) {
    const sourceRoot = path.resolve(projectRoot, source);
    const sourceFiles = await collectFiles(sourceRoot);
    for (const fullPath of sourceFiles) {
      const stat = await fs.stat(fullPath);
      files.push({
        sourceRoot,
        fullPath,
        size: stat.size,
        storagePath: toStoragePath(options.prefix, sourceRoot, fullPath),
      });
    }
  }

  const targetFiles = options.match
    ? files.filter((file) =>
        path.relative(projectRoot, file.fullPath).split(path.sep).join("/").includes(options.match),
      )
    : files;

  const duplicatePaths = targetFiles
    .map((file) => file.storagePath)
    .filter((storagePath, index, paths) => paths.indexOf(storagePath) !== index);
  if (duplicatePaths.length > 0) {
    throw new Error(`Storage path が重複しています: ${duplicatePaths.slice(0, 5).join(", ")}`);
  }

  const totalBytes = targetFiles.reduce((sum, file) => sum + file.size, 0);
  const startedAt = new Date().toISOString();
  console.log(
    `${options.dryRun ? "[dry-run] " : ""}${targetFiles.length} files / ${Math.round(totalBytes / 1024 / 1024)} MB`,
  );
  console.log(JSON.stringify(summarizeByExtension(targetFiles), null, 2));

  if (options.dryRun) return;

  const { error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketError) throw new Error(`Storage bucket "${bucket}" を取得できません: ${bucketError.message}`);

  let uploaded = 0;
  const failures = [];
  const manifestFiles = [];

  await runPool(targetFiles, options.concurrency, async (file, index) => {
    const buffer = await fs.readFile(file.fullPath);
    const fileHash = sha256(buffer);
    const contentType = getContentType(file.fullPath);
    const uploadResult = await uploadWithRetry(supabase, bucket, file, buffer, contentType, uploadAuth);
    const uploadError = uploadResult.error;

    if (uploadError) {
      failures.push({
        fullPath: path.relative(projectRoot, file.fullPath),
        storagePath: file.storagePath,
        error: uploadError.message,
      });
      console.error(`fail ${index + 1}/${targetFiles.length} ${file.storagePath}: ${uploadError.message}`);
      return;
    }

    uploaded += 1;
    manifestFiles.push({
      sourcePath: path.relative(projectRoot, file.fullPath).split(path.sep).join("/"),
      storageBucket: bucket,
      storagePath: file.storagePath,
      storageMode: uploadResult.storageMode,
      descriptorPath: uploadResult.descriptorPath ?? null,
      parts: uploadResult.parts ?? [],
      size: file.size,
      sha256: fileHash,
      contentType,
    });

    if (uploaded % 25 === 0 || uploaded === targetFiles.length) {
      console.log(`uploaded ${uploaded}/${targetFiles.length}`);
    }
  });

  let verified = 0;
  const verificationFailures = [];
  if (options.verify && failures.length === 0) {
    const sortedManifestFiles = manifestFiles.sort((a, b) =>
      a.storagePath.localeCompare(b.storagePath, "ja"),
    );
    await runPool(sortedManifestFiles, options.concurrency, async (file) => {
      const result = await verifyDownloadedFile(supabase, bucket, file);
      if (!result.ok) {
        verificationFailures.push({
          storagePath: file.storagePath,
          error: result.error,
        });
        return;
      }

      verified += 1;
      if (verified % 25 === 0 || verified === sortedManifestFiles.length) {
        console.log(`verified ${verified}/${sortedManifestFiles.length}`);
      }
    });
  }

  const finishedAt = new Date().toISOString();
  const manifest = {
    startedAt,
    finishedAt,
    bucket,
    prefix: options.prefix,
    sources: options.sources,
    match: options.match,
    totalFiles: targetFiles.length,
    totalBytes,
    uploaded,
    failed: failures.length,
    verified,
    verificationFailed: verificationFailures.length,
    extensionSummary: summarizeByExtension(targetFiles),
    files: manifestFiles.sort((a, b) => a.storagePath.localeCompare(b.storagePath, "ja")),
    failures,
    verificationFailures,
  };

  const reportDir = path.join(projectRoot, "tmp", "supabase-template-originals-upload");
  await fs.mkdir(reportDir, { recursive: true });
  const reportName = `template-originals-${finishedAt.replace(/[:.]/gu, "-")}.json`;
  const reportPath = path.join(reportDir, reportName);
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(reportPath, manifestBuffer);

  const manifestStoragePath = `${options.prefix}/_manifests/${reportName}`;
  const { error: manifestUploadError } = await supabase.storage
    .from(bucket)
    .upload(manifestStoragePath, manifestBuffer, {
      cacheControl: "3600",
      contentType: "application/json",
      upsert: true,
    });
  if (manifestUploadError) {
    failures.push({
      fullPath: path.relative(projectRoot, reportPath),
      storagePath: manifestStoragePath,
      error: manifestUploadError.message,
    });
  }

  console.log("");
  console.log("Summary");
  console.log(`  bucket:    ${bucket}`);
  console.log(`  prefix:    ${options.prefix}`);
  console.log(`  uploaded:  ${uploaded}/${targetFiles.length}`);
  console.log(`  failed:    ${failures.length}`);
  console.log(`  verified:  ${verified}${options.verify ? `/${uploaded}` : " (skipped)"}`);
  console.log(`  report:    ${path.relative(projectRoot, reportPath)}`);
  console.log(`  manifest:  ${manifestStoragePath}`);

  if (failures.length > 0 || verificationFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
