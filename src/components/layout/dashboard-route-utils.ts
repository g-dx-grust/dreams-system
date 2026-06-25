export function isTemplateMappingWorkspace(pathname: string) {
  return /^\/templates\/\d+\/mapping\/?$/.test(pathname);
}

export type RouteCrumb = { label: string; href?: string };
export type RouteMeta = { number: string; title: string };

const TOP_LABELS: Record<string, string> = {
  cases: "案件",
  map: "地図",
  persons: "関係者台帳",
  documents: "帳票履歴",
  templates: "テンプレート",
  users: "ユーザー管理",
  "audit-logs": "監査ログ",
};

const TOP_META: Record<string, RouteMeta> = {
  cases: { number: "02", title: "案件一覧" },
  map: { number: "03", title: "地図" },
  persons: { number: "04", title: "関係者台帳" },
  documents: { number: "05", title: "帳票履歴" },
  templates: { number: "06", title: "テンプレート" },
  users: { number: "08", title: "ユーザー管理" },
  "audit-logs": { number: "07", title: "監査ログ" },
};

const SUB_LABELS: Record<string, string> = {
  new: "新規登録",
  edit: "編集",
  persons: "関係者",
  parcels: "土地情報",
  map: "地図",
  financial: "金額",
  documents: "帳票生成",
  history: "生成履歴",
  mapping: "マッピング",
  "new-version": "新版作成",
};

const isEntityId = (segment: string) => /^\d+$/.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment);

/*
 * pathname からパンくずを解決する。末尾（現在地）はリンクにしない（href なし）。
 * 動的セグメント（案件ID 等）は「詳細」として表示する。see: DESIGN.md §8.7
 */
export function resolveBreadcrumb(pathname: string): RouteCrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: RouteCrumb[] = [{ label: "ダッシュボード", href: "/" }];
  if (segments.length === 0) {
    return [{ label: "ダッシュボード" }];
  }

  let href = "";
  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const isLast = index === segments.length - 1;
    let label: string;
    if (index === 0) {
      label = TOP_LABELS[segment] ?? segment;
    } else if (isEntityId(segment)) {
      label = "詳細";
    } else {
      label = SUB_LABELS[segment] ?? segment;
    }
    crumbs.push({ label, href: isLast ? undefined : href });
  });

  return crumbs;
}

export function resolveRouteMeta(pathname: string): RouteMeta {
  const [segment] = pathname.split("/").filter(Boolean);
  if (!segment) return { number: "01", title: "ダッシュボード" };
  return TOP_META[segment] ?? { number: "00", title: TOP_LABELS[segment] ?? segment };
}
