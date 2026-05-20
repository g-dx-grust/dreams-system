import JSZip from "jszip";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const url = new URL(req.url);
  const documentIds = parseIds(url.searchParams.get("ids"));
  if (documentIds.length === 0) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: caseRow }, { data: histories, error }] = await Promise.all([
    supabase.from("cases").select("case_number").eq("id", caseId).single(),
    supabase
      .from("document_histories")
      .select("id, case_id, file_name, file_path")
      .eq("case_id", caseId)
      .in("id", documentIds)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !histories || histories.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const history of histories) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(history.file_path.replace(/^documents\//, ""));
    if (downloadError || !blob) continue;

    const buffer = Buffer.from(await blob.arrayBuffer());
    zip.file(uniqueFileName(history.file_name, usedNames), buffer);
  }

  const fileCount = Object.keys(zip.files).length;
  if (fileCount === 0) return new NextResponse("Not Found", { status: 404 });

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  const zipBody = new ArrayBuffer(zipBuffer.byteLength);
  new Uint8Array(zipBody).set(zipBuffer);
  const caseNumber = sanitizeFileName(caseRow?.case_number ?? `case-${caseId}`);
  const fileName = `${caseNumber}_帳票一括_${buildDateStamp()}.zip`;

  return new NextResponse(zipBody, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function uniqueFileName(fileName: string, usedNames: Set<string>) {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
  let index = 2;
  let candidate = `${base}_${index}${ext}`;
  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function buildDateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_");
}
