import JSZip from "jszip";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { requestIpFromHeaders } from "@/lib/request-ip";
import {
  attachmentHeaders,
  parsePositiveInteger,
  parsePositiveIntegerList,
  sanitizeDownloadFileName,
} from "@/lib/security/download";
import {
  buildParcelAttachmentFileName,
  buildParcelAttachmentXlsx,
  type ParcelAttachmentRow,
} from "@/lib/transfer/parcel-attachment";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const caseId = parsePositiveInteger(id);
  if (!caseId) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const url = new URL(req.url);
  const documentIds = parsePositiveIntegerList(url.searchParams.get("ids"), 100);
  if (documentIds.length === 0) {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const includeParcelAttachment = url.searchParams.get("besshi") === "1";

  const supabase = await createClient();
  const [{ data: caseRow }, { data: histories, error }] = await Promise.all([
    supabase.from("cases").select("case_number, case_name").eq("id", caseId).single(),
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
    zip.file(
      uniqueFileName(sanitizeDownloadFileName(history.file_name, "document"), usedNames),
      buffer,
    );
  }

  if (includeParcelAttachment) {
    const { data: parcels } = await supabase
      .from("case_parcels")
      .select("sort_order, pref, city, oaza, aza, chiban, chimoku, area, tenyo_area, memo")
      .eq("case_id", caseId)
      .order("sort_order", { ascending: true });
    if (parcels && parcels.length > 0) {
      const attachment = await buildParcelAttachmentXlsx(
        {
          case_number: caseRow?.case_number ?? `case-${caseId}`,
          case_name: caseRow?.case_name ?? null,
        },
        parcels as ParcelAttachmentRow[],
      );
      const attachmentName = buildParcelAttachmentFileName(
        caseRow?.case_number ?? `case-${caseId}`,
      );
      zip.file(
        uniqueFileName(
          sanitizeDownloadFileName(attachmentName, "parcel_attachment.xlsx"),
          usedNames,
        ),
        attachment,
      );
    }
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

  await logAudit({
    userId: user.id,
    action: "document.download",
    entityType: "case",
    entityId: caseId,
    detail: {
      caseId,
      documentIds: histories.map((history) => history.id),
      fileNames: histories.map((history) => history.file_name),
      fileCount,
      includeParcelAttachment,
      downloadMode: "bulk_zip",
      zipFileName: fileName,
    },
    ipAddress: requestIpFromHeaders(req.headers),
  });

  return new NextResponse(zipBody, {
    headers: attachmentHeaders("application/zip", fileName),
  });
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
