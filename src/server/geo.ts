"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { type ActionResult, ok, fail } from "@/lib/result";
import { parseCoordinateFileBuffer } from "@/lib/coordinate-import";
import {
  type CaseMapPayload,
  type CaseOverviewRow,
  type ImportedCoordinatePointRow,
  type ParcelMapRow,
  type ParcelOverviewRow,
} from "@/lib/geo";

/*
 * 地図（GIS）P1 サーバアクション。座標は WGS84/EPSG:4326。空間処理は
 * SECURITY DEFINER RPC（is_active_user 検査済）に委譲する。
 * see: docs/gis-map-implementation-plan.md §5, §6C
 */

// 案件詳細レイアウトが案件の存在を検証するため、ここでは存在チェックを省く。
export async function getCaseParcelsForMap(
  caseId: number,
): Promise<ActionResult<ParcelMapRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_case_parcels_for_map", {
    p_case_id: caseId,
  });
  if (error) return fail("地図用の土地情報の取得に失敗しました。");
  return ok((data ?? []) as ParcelMapRow[]);
}

export async function getCaseMap(caseId: number): Promise<ActionResult<CaseMapPayload>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_case_map", {
    p_case_id: caseId,
  });
  if (error || data == null) return fail("地図用の案件情報の取得に失敗しました。");
  return ok(data as CaseMapPayload);
}

// 横断地図用：全案件の座標付き筆を取得。RPC が is_active_user() で防御する。
export async function getAllParcelsForMap(): Promise<ActionResult<ParcelOverviewRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_all_parcels_for_map");
  if (error) return fail("地図用の土地情報の取得に失敗しました。");
  return ok((data ?? []) as ParcelOverviewRow[]);
}

// 横断地図用：案件マスタの座標がある案件だけを取得する。
export async function getAllCasesForMap(): Promise<ActionResult<CaseOverviewRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_all_cases_for_map");
  if (error) return fail("地図用の案件情報の取得に失敗しました。");
  return ok((data ?? []) as CaseOverviewRow[]);
}

export async function getImportedCoordinatePoints(): Promise<
  ActionResult<ImportedCoordinatePointRow[]>
> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imported_coordinate_points")
    .select("id, source_file_name, point_name, latitude, longitude, memo, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return fail("取り込み済み座標点の取得に失敗しました。");
  return ok((data ?? []) as ImportedCoordinatePointRow[]);
}

export async function importCoordinatePoints(
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number; totalRows: number }>> {
  const user = await requireUser();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return fail("取り込むファイルを選択してください。");

  const fileName = file.name || "coordinates";
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    return fail("CSVまたはExcel（.xlsx）を選択してください。");
  }
  if (file.size > 5 * 1024 * 1024) {
    return fail("ファイルサイズは5MB以下にしてください。");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseCoordinateFileBuffer(buffer, extension);

  if (!parsed.hasRequiredHeaders) {
    return fail("緯度と経度のヘッダー列が見つかりませんでした。");
  }
  if (parsed.points.length === 0) {
    return fail("取り込める緯度/経度の行がありませんでした。");
  }
  if (parsed.points.length > 1000) {
    return fail("一度に取り込める座標点は1000件までです。");
  }

  const supabase = await createClient();
  const rows = parsed.points.map((point) => ({
    source_file_name: fileName,
    point_name: point.pointName,
    latitude: point.lat,
    longitude: point.lng,
    memo: point.memo,
    imported_by_user_id: user.id,
  }));
  const { error } = await supabase.from("imported_coordinate_points").insert(rows);
  if (error) return fail("座標点の取り込みに失敗しました。");

  await logAudit({
    userId: user.id,
    action: "map.coordinate_import",
    entityType: "map_coordinate_point",
    entityId: null,
    detail: {
      sourceFileName: fileName,
      imported: parsed.points.length,
      skipped: parsed.skipped,
      totalRows: parsed.totalRows,
    },
  });

  revalidatePath("/map");
  return ok({ imported: parsed.points.length, skipped: parsed.skipped, totalRows: parsed.totalRows });
}

const PinSchema = z.object({
  parcelId: z.number().int().positive(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const CaseCoordinateSchema = z.object({
  caseId: z.number().int().positive(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

export async function setCaseCoordinates(
  caseId: number,
  lng: number,
  lat: number,
): Promise<ActionResult<{ caseId: number }>> {
  const user = await requireUser();
  const parsed = CaseCoordinateSchema.safeParse({ caseId, lng, lat });
  if (!parsed.success) return fail("座標が正しくありません。");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_case_coordinates", {
    p_case_id: parsed.data.caseId,
    p_lng: parsed.data.lng,
    p_lat: parsed.data.lat,
  });
  if (error || data == null) return fail("案件座標の保存に失敗しました。");

  const savedCaseId = data as number;
  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: savedCaseId,
    detail: { action: "setCaseCoordinates", lng, lat },
  });
  revalidatePath("/map");
  revalidatePath(`/cases/${savedCaseId}`);
  revalidatePath(`/cases/${savedCaseId}/map`);
  return ok({ caseId: savedCaseId });
}

export async function clearCaseCoordinates(
  caseId: number,
): Promise<ActionResult<{ caseId: number }>> {
  const user = await requireUser();
  if (!Number.isInteger(caseId) || caseId <= 0) return fail("案件が正しくありません。");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_case_coordinates", {
    p_case_id: caseId,
  });
  if (error || data == null) return fail("案件座標の解除に失敗しました。");

  const clearedCaseId = data as number;
  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: clearedCaseId,
    detail: { action: "clearCaseCoordinates" },
  });
  revalidatePath("/map");
  revalidatePath(`/cases/${clearedCaseId}`);
  revalidatePath(`/cases/${clearedCaseId}/map`);
  return ok({ caseId: clearedCaseId });
}

export async function setCaseParcelPin(
  parcelId: number,
  lng: number,
  lat: number,
): Promise<ActionResult<{ caseId: number }>> {
  const user = await requireUser();
  const parsed = PinSchema.safeParse({ parcelId, lng, lat });
  if (!parsed.success) return fail("座標が正しくありません。");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_case_parcel_pin", {
    p_parcel_id: parsed.data.parcelId,
    p_lng: parsed.data.lng,
    p_lat: parsed.data.lat,
  });
  if (error || data == null) return fail("ピンの保存に失敗しました。");

  const caseId = data as number;
  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: caseId,
    detail: { action: "setCaseParcelPin", parcelId, lng, lat },
  });
  revalidatePath(`/cases/${caseId}/map`);
  revalidatePath(`/cases/${caseId}/parcels`);
  return ok({ caseId });
}

export async function clearCaseParcelGeo(
  parcelId: number,
): Promise<ActionResult<{ caseId: number }>> {
  const user = await requireUser();
  if (!Number.isInteger(parcelId) || parcelId <= 0) return fail("筆が正しくありません。");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_case_parcel_geo", {
    p_parcel_id: parcelId,
  });
  if (error || data == null) return fail("座標の解除に失敗しました。");

  const caseId = data as number;
  await logAudit({
    userId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: caseId,
    detail: { action: "clearCaseParcelGeo", parcelId },
  });
  revalidatePath(`/cases/${caseId}/map`);
  revalidatePath(`/cases/${caseId}/parcels`);
  return ok({ caseId });
}
