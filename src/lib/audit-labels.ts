/*
 * 監査ログ表示用の日本語ラベル辞書。クライアント／サーバ双方から参照するため、
 * サーバ専用モジュール（@/lib/audit）に依存させずここに分離する。
 * アクションコードの正本は @/lib/audit の AuditAction。
 */

export const AuditActionLabels: Record<string, string> = {
  "case.create": "案件 作成",
  "case.update": "案件 更新",
  "case.delete": "案件 削除",
  "case_person.add": "案件関係者 追加",
  "case_person.remove": "案件関係者 削除",
  "case_person.resync": "案件関係者 再同期",
  "person.create": "関係者 作成",
  "person.update": "関係者 更新",
  "person.delete": "関係者 削除",
  "person.resync": "関係者 再同期",
  "template.upload": "テンプレート アップロード",
  "template.update": "テンプレート 更新",
  "template.deactivate": "テンプレート 無効化",
  "document.generate": "帳票 生成",
  "map.coordinate_import": "座標点 取り込み",
  "user.invite": "ユーザー 招待",
  "user.role_change": "ユーザー 権限変更",
  "user.deactivate": "ユーザー 無効化",
  "user.activate": "ユーザー 有効化",
};

export const AuditEntityLabels: Record<string, string> = {
  case: "案件",
  case_person: "案件関係者",
  person: "関係者",
  template: "テンプレート",
  document: "帳票",
  user: "ユーザー",
  map_coordinate_point: "座標点",
};

export function auditActionLabel(action: string): string {
  return AuditActionLabels[action] ?? action;
}

export function auditEntityLabel(entityType: string | null): string {
  if (!entityType) return "—";
  return AuditEntityLabels[entityType] ?? entityType;
}

export function auditActionTone(
  action: string,
): "neutral" | "info" | "warning" | "success" | "danger" {
  if (action.endsWith(".delete") || action.endsWith(".remove") || action.endsWith(".deactivate")) {
    return "danger";
  }
  if (action.endsWith(".create") || action.endsWith(".invite") || action.endsWith(".generate")) {
    return "success";
  }
  if (action.endsWith(".update") || action.endsWith(".resync") || action.endsWith(".role_change")) {
    return "info";
  }
  if (action.endsWith(".activate")) return "success";
  return "neutral";
}
