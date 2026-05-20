/*
 * 氏名・検索クエリの正規化。
 * see: docs/phase2/05_persons_master.md §重複候補検出ロジック
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\s　・]/g, "")
    .toLowerCase();
}

export function normalizeZip(zip: string): string {
  return zip.replace(/[^\d]/g, "").slice(0, 7);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}
