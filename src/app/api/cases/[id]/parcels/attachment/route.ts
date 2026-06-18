import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import {
  buildParcelAttachmentFileName,
  buildParcelAttachmentXlsx,
  type ParcelAttachmentRow,
} from "@/lib/transfer/parcel-attachment";

export const runtime = "nodejs";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: caseRow }, { data: parcels }] = await Promise.all([
    supabase.from("cases").select("case_number, case_name").eq("id", caseId).single(),
    supabase
      .from("case_parcels")
      .select("sort_order, pref, city, oaza, aza, chiban, chimoku, area, tenyo_area, memo")
      .eq("case_id", caseId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!caseRow) return new NextResponse("Not Found", { status: 404 });
  if (!parcels || parcels.length === 0) {
    return new NextResponse("筆情報が登録されていません。", { status: 404 });
  }

  const buffer = await buildParcelAttachmentXlsx(
    { case_number: caseRow.case_number, case_name: caseRow.case_name },
    parcels as ParcelAttachmentRow[],
  );
  const body = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(body).set(buffer);
  const fileName = buildParcelAttachmentFileName(caseRow.case_number);

  return new NextResponse(body, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
