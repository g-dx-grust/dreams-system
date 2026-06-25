// see: docs/phase3/09_document_history.md §ダウンロード
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { requestIpFromHeaders } from "@/lib/request-ip";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: history, error } = await supabase
    .from("document_histories")
    .select("*")
    .eq("id", Number(id))
    .single();

  if (error || !history) return new NextResponse("Not Found", { status: 404 });

  const { data: blob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(history.file_path.replace(/^documents\//, ""));

  if (dlErr || !blob) return new NextResponse("Not Found", { status: 404 });

  await logAudit({
    userId: user.id,
    action: "document.download",
    entityType: "document",
    entityId: history.id,
    detail: {
      caseId: history.case_id,
      templateId: history.template_id,
      fileName: history.file_name,
      fileType: history.file_type,
      downloadMode: "single",
    },
    ipAddress: requestIpFromHeaders(req.headers),
  });

  const contentType =
    history.file_type === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(history.file_name)}`,
    },
  });
}
