import { isAuthorizedLarkSyncRequest, syncPendingSchedulesToLark } from "@/server/lark-sync";

export async function POST(request: Request) {
  if (!isAuthorizedLarkSyncRequest(request)) {
    return Response.json(
      { ok: false, error: "Lark同期の認証情報が正しくありません。" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 200)
    : 50;
  const summary = await syncPendingSchedulesToLark(limit);

  return Response.json({ ok: true, summary });
}
