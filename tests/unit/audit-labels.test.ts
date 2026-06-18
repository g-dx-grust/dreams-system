import { describe, expect, it } from "vitest";
import { auditActionLabel, auditActionTone, auditEntityLabel } from "@/lib/audit-labels";

describe("audit labels", () => {
  it("renders authentication audit actions in Japanese", () => {
    expect(auditActionLabel("auth.login_success")).toBe("ログイン 成功");
    expect(auditActionLabel("auth.login_failure")).toBe("ログイン 失敗");
    expect(auditEntityLabel("auth")).toBe("認証");
  });

  it("renders calendar and daily report audit actions in Japanese", () => {
    expect(auditActionLabel("document.generate")).toBe("帳票 生成");
    expect(auditActionLabel("document.download")).toBe("帳票 ダウンロード");
    expect(auditActionLabel("schedule.create")).toBe("予定 作成");
    expect(auditActionLabel("schedule.update")).toBe("予定 更新");
    expect(auditActionLabel("schedule.delete")).toBe("予定 削除");
    expect(auditActionLabel("daily_report.save")).toBe("日報 保存");
    expect(auditActionLabel("daily_report.submit")).toBe("日報 提出");
    expect(auditActionLabel("comment.create")).toBe("コメント 投稿");
  });

  it("renders calendar and daily report audit entities in Japanese", () => {
    expect(auditEntityLabel("schedule")).toBe("予定");
    expect(auditEntityLabel("daily_report")).toBe("日報");
    expect(auditEntityLabel("comment")).toBe("コメント");
  });

  it("assigns operation tones for save and submit actions", () => {
    expect(auditActionTone("auth.login_success")).toBe("success");
    expect(auditActionTone("auth.login_failure")).toBe("danger");
    expect(auditActionTone("document.download")).toBe("info");
    expect(auditActionTone("daily_report.save")).toBe("info");
    expect(auditActionTone("daily_report.submit")).toBe("success");
  });
});
