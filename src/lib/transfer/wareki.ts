/*
 * 和暦変換ヘルパ。帳票転記で「令和X年M月D日」形式が必要なため、
 * Phase 3 の転記エンジンより先行して用意する。
 * see: docs/phase3/07_transfer_engine.md §和暦変換
 */

type Era = {
  name: string;
  /** 元号開始日（この日以降がこの元号） */
  startYear: number;
  startMonth: number; // 1-based
  startDay: number;
};

// 降順で走査するため、新しい元号から順に並べる
const ERAS: readonly Era[] = [
  { name: "令和", startYear: 2019, startMonth: 5, startDay: 1 },
  { name: "平成", startYear: 1989, startMonth: 1, startDay: 8 },
  { name: "昭和", startYear: 1926, startMonth: 12, startDay: 25 },
];

/**
 * Date を和暦文字列（例: 令和6年4月23日）に変換する。
 * 元年は "元年" 表記、対象外の日付は西暦を返す。
 */
export function toWareki(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return "";
  }

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  for (const era of ERAS) {
    const isSameOrAfterStart =
      y > era.startYear ||
      (y === era.startYear && m > era.startMonth) ||
      (y === era.startYear && m === era.startMonth && day >= era.startDay);

    if (isSameOrAfterStart) {
      const eraYear = y - era.startYear + 1;
      return `${era.name}${eraYear}年${m}月${day}日`;
    }
  }

  // 昭和より前は西暦で返す
  return `${y}年${m}月${day}日`;
}

/**
 * YYYY-MM-DD 形式の文字列を和暦に変換する。不正値は空文字。
 */
export function toWarekiFromISODate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return toWareki(new Date(y, m - 1, d));
}
