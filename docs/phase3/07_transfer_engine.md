# Phase 3-1: 帳票転記エンジン仕様（Node.js 版）

## 概要

本システムの中核機能。案件データと人マスタから必要な情報を抽出し、選択した様式ファイルの
`{placeholder}` に値を差し込んで編集可能な `.docx` / `.xlsx` を生成する。

**技術スタック（確定）**

| 用途           | ライブラリ                                                           |
| -------------- | -------------------------------------------------------------------- |
| Word 差し込み  | `docxtemplater`（+ `pizzip`）                                        |
| Excel 差し込み | `exceljs`                                                            |
| 実行環境       | Vercel（Node ランタイム）／Supabase Storage をファイル入出力の窓口に |

**使わないもの**：python-docx, docxtpl, openpyxl, LibreOffice（旧 `.doc` / `.xls` は**ローカル Mac で前処理**して Storage に `.docx` / `.xlsx` として登録する）。

---

## TransferContext（転記データ構造）

すべてのプレースホルダーはこの型のパスで参照する。

```ts
// src/types/transfer.ts

export type PersonContext = {
  name: string;
  nameKana: string;
  zip: string;
  addressPref: string;
  addressCity: string;
  addressTown: string;
  addressLine1: string;
  addressLine2: string;
  addressFull: string; // 都道府県〜番地を結合
  addressNoPref: string; // 都道府県を除いた住所
  phone: string;
  fax: string;
  email: string;
  // 法人のみ
  corporateNumber: string;
  representativeName: string;
};

export type ParcelContext = {
  pref: string;
  city: string;
  aza: string;
  chiban: string;
  locationFull: string; // 市区町村〜地番を結合
  chimoku: string;
  area: string; // "1,500.00"（カンマ付き）
  tenyoArea: string;
};

export type TransferContext = {
  // 案件基本情報
  caseNumber: string;
  caseName: string;
  caseTypeLabel: string;
  submissionTarget: string;
  submissionDate: string; // 申請書類の日付欄。窓口提出日に手書きするため "年月日" のみ出力
  deadlineDate: string;
  today: string; // 帳票生成日欄。窓口提出日に手書きするため "年月日" のみ出力
  todayYear: string; // 自動入力しないため空文字
  todayMonth: string;
  todayDay: string;

  // 関係者（役割別）
  applicant: PersonContext;
  transferee: PersonContext;
  transferor: PersonContext;
  agent: PersonContext;
  billing: PersonContext;
  neighbor: PersonContext;

  // 複数関係者
  applicants: PersonContext[];
  neighbors: PersonContext[];

  // 土地情報
  parcels: ParcelContext[];
  parcel: ParcelContext; // parcels[0] のショートカット
  totalArea: string;
  totalTenyoArea: string;

  // 金額情報
  estimateAmount: string;
  estimateAmountTax: string;
  estimateAmountTotal: string;
  invoiceAmount: string;
  invoiceAmountTax: string;
  invoiceAmountTotal: string;
};
```

> **プレースホルダー側のネストは snake_case でも camelCase でもなく、TS の型名をそのまま使う**（例：`{applicant.name}`）。docxtemplater / exceljs 両方とも JS オブジェクトをそのまま渡す。

---

## プレースホルダー記法

### Word（docxtemplater）

docxtemplater は **`{placeholder}`（波括弧 1 つ）** を使う。docxtpl の `{{ }}` とは異なるので要注意。

```
{applicant.name}                  ← 申請者氏名
{applicant.addressFull}           ← 申請者住所（全体）
{parcels[0].chiban}               ← 1 筆目の地番
{today}                           ← 日付欄ラベル（年月日）
{todayYear}                       ← 空欄（年は手書き）

{#parcels}
{locationFull} {chimoku} {area}㎡    ← ループ内ではオブジェクトプロパティに直接アクセス
{/parcels}
```

### Excel（exceljs）

セル座標またはワークブックの「名前の定義」で指定する。

```
B5  ← applicant.name
C5  ← applicant.addressFull
D8  ← parcels[0].chiban
```

> 表の行増殖（行コピーしながらループ）は Excel テンプレ側で「繰り返し開始行／終了行」を名前の定義で宣言し、エンジン側が行コピー＋セル差し込みを行う。複雑な様式はこの方式で対応する（下記「Excel の行増殖」参照）。

---

## エンジン実装

### 共通ヘルパ

```ts
// src/lib/transfer/engine.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransferContext } from "@/types/transfer";

export type Mapping = {
  placeholder: string; // {applicant.name} or "B5"
  fieldPath: string; // "applicant.name" or "parcels[0].chiban"
  label?: string;
  isRequired?: boolean;
};

export function resolvePath(ctx: unknown, path: string): string {
  // "applicant.name" や "parcels[0].chiban" を解決
  const parts = path.split(/\.|\[(\d+)\]/).filter(Boolean);
  let current: any = ctx;
  for (const p of parts) {
    if (current == null) return "";
    current = /^\d+$/.test(p) ? current[Number(p)] : current[p];
  }
  return current == null ? "" : String(current);
}
```

### Word 転記（docxtemplater）

```ts
// src/lib/transfer/docx.ts
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TransferContext } from "@/types/transfer";
import type { Mapping } from "./engine";

const HIGHLIGHT_COLOR = "yellow";

export function fillDocx(
  templateBuffer: ArrayBuffer,
  context: TransferContext,
  mappings: Mapping[],
  highlight: boolean,
): Buffer {
  const zip = new PizZip(templateBuffer);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "", // 未定義値は空文字
  });

  const renderCtx = highlight
    ? wrapWithHighlight(context, new Set(mappings.map((m) => m.fieldPath)))
    : context;

  doc.render(renderCtx);

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * ハイライト ON の場合、マッピングされたフィールドの値を
 * Word の highlight タグを模した文字列に包んで返す（RichText 相当）。
 * ※ docxtemplater 標準の置換では Run スタイルを直接は変えられないため、
 *    テンプレート側で該当箇所を事前に黄色ハイライト済みの Run にしておくか、
 *    "html module"（無料版）で包む方式のいずれかを採る。
 *    初期実装は **テンプレ側でハイライト済み Run を用意** する方式を採用する（3-A）。
 */
function wrapWithHighlight(ctx: TransferContext, _paths: Set<string>): TransferContext {
  // 初期実装は pass-through。ハイライトはテンプレート側で Run に黄色を付けておく運用。
  return ctx;
}
```

#### 旧Word変換テンプレートの正規化

`.doc`から`textutil`等で変換したテンプレートには、Wordが修復対象として扱う非標準OOXMLが
残ることがある。生成後に「ファイルが壊れている」警告やレイアウト崩れを出さないため、
`fillDocx`はレンダー前後で以下を正規化する。

- `w:sz-cs`を`w:szCs`へ変換する
- `w:first-line`を`w:firstLine`へ変換する
- `eq \o\ac(○,1)`〜`eq \o\ac(○,20)`等の丸ボタン相当の式フィールドは空文字にする
- `eq \o\ac(○,印)`等の丸印相当の式フィールドは空文字にする
- Word内の丸ボタン図形（楕円のVML/OOXML図形）は自動出力しない
- 表・セルの枠線はそのまま残す
- Word差し込み値に改行が含まれる場合は、改行1つにつき半角スペース1個へ置換して単一行に正規化する
  （テンプレートの行送りは変えず、改行の前後の語が連結して読めなくなることを防ぐ）

#### 日付欄の運用（重要）

申請書類は窓口提出日にその場で日付を手書きするため、帳票生成時に日付を自動入力しない。

- `{today}` / `{submissionDate}` は `"年月日"` のラベルだけを出力する
- `{todayYear}` / `{todayMonth}` / `{todayDay}` は空文字を出力する
- 締切管理用の `{deadlineDate}` は帳票本文で必要な場合のみ従来どおり和暦を出力する
- `.docx`のZIPを`[Content_Types].xml`先頭、ディレクトリエントリなしで再生成する

#### ハイライト方式の決定（重要）

docxtemplater は XML の「テキスト置換」が本質のため、docxtpl の `RichText` のように
**値に色属性を後付けする**ことは標準ではできない。以下の 3 案があり、初期実装は **3-A** を採用する。

| 案  | 方法                                                                                                                                                   | 採否                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 3-A | **テンプレート側でプレースホルダーを含む Run を黄色ハイライト済みにしておく**。エンジンはテキストを差し替えるだけで、ハイライトは Run の属性として残る | ✅ 採用（シンプル・高速） |
| 3-B | `docxtemplater-html-module`（無料）でプレースホルダーを `<span style="background-color:yellow">値</span>` で包んで挿入                                 | 将来オプション            |
| 3-C | 自前で `word/document.xml` の置換後に `w:highlight` を注入                                                                                             | 過剰。採らない            |

> **テンプレート作成ルール**：ハイライト対象のプレースホルダーは、Word のテンプレ上で該当 Run を黄色ハイライトしておくこと。`highlight=false` で生成するには「ハイライトなし版テンプレート」を別途登録するか、エンジン側で生成後に `<w:highlight w:val="yellow"/>` を削除する後処理を入れる（これは Phase 3 後半で検討）。

### Excel 転記（exceljs）

```ts
// src/lib/transfer/xlsx.ts
import ExcelJS from "exceljs";
import type { TransferContext } from "@/types/transfer";
import { resolvePath, type Mapping } from "./engine";

const HIGHLIGHT_ARGB = "FFFFFF00"; // 黄色（ARGB）

export async function fillXlsx(
  templateBuffer: ArrayBuffer,
  context: TransferContext,
  mappings: Mapping[],
  highlight: boolean,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);

  for (const mapping of mappings) {
    const value = resolvePath(context, mapping.fieldPath);
    if (value === "") continue;

    // placeholder は "Sheet1!B5" 形式 or "B5" 形式 or 名前定義
    const { sheetName, cellRef } = parsePlaceholder(mapping.placeholder, wb);
    const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
    if (!ws) continue;

    try {
      const cell = ws.getCell(cellRef);
      cell.value = coerceValue(value);
      if (highlight) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: HIGHLIGHT_ARGB },
        };
      }
    } catch {
      // 無効なセル座標はスキップ
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function parsePlaceholder(
  raw: string,
  wb: ExcelJS.Workbook,
): { sheetName?: string; cellRef: string } {
  // "Sheet1!B5" → { sheetName: "Sheet1", cellRef: "B5" }
  // "B5"        → { cellRef: "B5" }
  // 名前の定義  → wb.definedNames から解決
  const m = raw.match(/^([^!]+)!(.+)$/);
  if (m) return { sheetName: m[1], cellRef: m[2] };
  // 名前の定義にヒットするか
  const ranges = wb.definedNames.getRanges(raw);
  if (ranges && ranges.ranges.length > 0) {
    const r = ranges.ranges[0]; // "Sheet1!$B$5"
    const mm = r.match(/^([^!]+)!(\$?[A-Z]+\$?\d+)$/);
    if (mm) return { sheetName: mm[1], cellRef: mm[2].replace(/\$/g, "") };
  }
  return { cellRef: raw };
}

function coerceValue(v: string): string | number {
  // 数値っぽい文字列は数値として入れる（カンマ除去後）
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, "")) ? n : v;
}
```

#### Excel の行増殖（繰り返し表）

筆が複数あるなど「行を増やしながらデータを流す」要件は、テンプレート側に以下の命名規則でマーカーを置く：

- 名前の定義：`loop_parcels_start` → 繰り返し開始行のセル（通常は A 列）
- 名前の定義：`loop_parcels_end` → 繰り返し終了行のセル

エンジンは start〜end 行をテンプレート行として、`context.parcels` の要素数だけ複製し、
各行内の `{fieldPath}` 様の文字列（または名前定義）を置換する。実装は `fillXlsx` 内にモジュールを追加予定（Phase 3 後半）。

---

## TransferContext の組み立て

```ts
// src/lib/transfer/context-builder.ts
import type { TransferContext, PersonContext, ParcelContext } from "@/types/transfer";
import { toWareki, formatZip, formatPhone } from "./format";

const EMPTY_PERSON: PersonContext = {
  name: "",
  nameKana: "",
  zip: "",
  addressPref: "",
  addressCity: "",
  addressTown: "",
  addressLine1: "",
  addressLine2: "",
  addressFull: "",
  addressNoPref: "",
  phone: "",
  fax: "",
  email: "",
  corporateNumber: "",
  representativeName: "",
};

export function buildPersonContext(cp: CasePersonRow): PersonContext {
  const parts = [
    cp.snapshot_address_pref,
    cp.snapshot_address_city,
    cp.snapshot_address_town,
    cp.snapshot_address_line1,
    cp.snapshot_address_line2,
  ];
  const addressFull = parts.filter(Boolean).join("");
  const addressNoPref = parts.slice(1).filter(Boolean).join("");

  return {
    ...EMPTY_PERSON,
    name: cp.snapshot_name ?? "",
    nameKana: cp.snapshot_name_kana ?? "",
    zip: formatZip(cp.snapshot_zip ?? ""),
    addressPref: cp.snapshot_address_pref ?? "",
    addressCity: cp.snapshot_address_city ?? "",
    addressTown: cp.snapshot_address_town ?? "",
    addressLine1: cp.snapshot_address_line1 ?? "",
    addressLine2: cp.snapshot_address_line2 ?? "",
    addressFull,
    addressNoPref,
    phone: formatPhone(cp.snapshot_phone ?? ""),
    email: cp.snapshot_email ?? "",
  };
}

export function buildTransferContext(args: {
  caseRow: CaseRow;
  casePersons: CasePersonRow[];
  parcels: CaseParcelRow[];
  financial?: CaseFinancialRow | null;
}): TransferContext {
  const today = new Date();
  const byRole = new Map<string, PersonContext>();
  const listByRole = { applicant: [] as PersonContext[], neighbor: [] as PersonContext[] };

  for (const cp of [...args.casePersons].sort((a, b) => a.sort_order - b.sort_order)) {
    const p = buildPersonContext(cp);
    if (!byRole.has(cp.role)) byRole.set(cp.role, p);
    if (cp.role === "applicant") listByRole.applicant.push(p);
    if (cp.role === "neighbor") listByRole.neighbor.push(p);
  }

  const parcels: ParcelContext[] = [...args.parcels]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      pref: p.pref ?? "",
      city: p.city ?? "",
      aza: p.aza ?? "",
      chiban: p.chiban ?? "",
      locationFull: [p.city, p.aza, p.chiban].filter(Boolean).join(""),
      chimoku: p.chimoku ?? "",
      area: p.area != null ? p.area.toLocaleString("ja-JP", { minimumFractionDigits: 2 }) : "",
      tenyoArea:
        p.tenyo_area != null
          ? p.tenyo_area.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
          : "",
    }));

  const totalArea = args.parcels.reduce((s, p) => s + Number(p.area ?? 0), 0);
  const totalTenyo = args.parcels.reduce((s, p) => s + Number(p.tenyo_area ?? 0), 0);

  return {
    caseNumber: args.caseRow.case_number,
    caseName: args.caseRow.case_name,
    caseTypeLabel: caseTypeLabelOf(args.caseRow.case_type),
    submissionTarget: args.caseRow.submission_target ?? "",
    submissionDate: args.caseRow.submission_date
      ? toWareki(new Date(args.caseRow.submission_date))
      : "",
    deadlineDate: args.caseRow.deadline_date ? toWareki(new Date(args.caseRow.deadline_date)) : "",
    today: toWareki(today),
    todayYear: `令和${today.getFullYear() - 2018}年`,
    todayMonth: String(today.getMonth() + 1),
    todayDay: String(today.getDate()),
    applicant: byRole.get("applicant") ?? EMPTY_PERSON,
    transferee: byRole.get("transferee") ?? EMPTY_PERSON,
    transferor: byRole.get("transferor") ?? EMPTY_PERSON,
    agent: byRole.get("agent") ?? EMPTY_PERSON,
    billing: byRole.get("billing") ?? EMPTY_PERSON,
    neighbor: byRole.get("neighbor") ?? EMPTY_PERSON,
    applicants: listByRole.applicant,
    neighbors: listByRole.neighbor,
    parcels,
    parcel: parcels[0] ?? {
      pref: "",
      city: "",
      aza: "",
      chiban: "",
      locationFull: "",
      chimoku: "",
      area: "",
      tenyoArea: "",
    },
    totalArea: totalArea ? totalArea.toLocaleString("ja-JP", { minimumFractionDigits: 2 }) : "",
    totalTenyoArea: totalTenyo
      ? totalTenyo.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    estimateAmount: amountStr(args.financial?.estimate_amount),
    estimateAmountTax: amountStr(taxOf(args.financial?.estimate_amount, args.financial?.tax_rate)),
    estimateAmountTotal: amountStr(
      totalOf(args.financial?.estimate_amount, args.financial?.tax_rate),
    ),
    invoiceAmount: amountStr(args.financial?.invoice_amount),
    invoiceAmountTax: amountStr(taxOf(args.financial?.invoice_amount, args.financial?.tax_rate)),
    invoiceAmountTotal: amountStr(
      totalOf(args.financial?.invoice_amount, args.financial?.tax_rate),
    ),
  };
}
```

### 和暦変換

```ts
// src/lib/transfer/wareki.ts (format.ts に統合)
export function toWareki(d: Date): string {
  const y = d.getFullYear();
  if (y >= 2019) return `令和${y - 2018}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (y >= 1989) return `平成${y - 1988}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${y}年${d.getMonth() + 1}月${d.getDate()}日`;
}
```

---

## 転記前チェック（preCheck）

```ts
// src/lib/transfer/precheck.ts
import type { TransferContext } from "@/types/transfer";
import { resolvePath, type Mapping } from "./engine";

export type PreCheckResult = {
  totalFields: number;
  filledFields: number;
  missingRequired: string[]; // label or fieldPath
  missingOptional: string[];
  previewData: Record<string, string>;
};

export function preCheck(ctx: TransferContext, mappings: Mapping[]): PreCheckResult {
  const result: PreCheckResult = {
    totalFields: mappings.length,
    filledFields: 0,
    missingRequired: [],
    missingOptional: [],
    previewData: {},
  };
  for (const m of mappings) {
    const v = resolvePath(ctx, m.fieldPath);
    result.previewData[m.fieldPath] = v;
    if (v) {
      result.filledFields++;
    } else if (m.isRequired) {
      result.missingRequired.push(m.label ?? m.fieldPath);
    } else {
      result.missingOptional.push(m.label ?? m.fieldPath);
    }
  }
  return result;
}
```

---

## ファイル命名規則

```ts
export function buildFileName(
  caseNumber: string,
  templateName: string,
  version: number,
  fileType: "docx" | "xlsx",
): string {
  // 例: 2026-FC-001_5条許可申請書_20260423_v1.docx
  const safeName = templateName.replace(/[\\/:*?"<>|　]/g, "_");
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${caseNumber}_${safeName}_${ymd}_v${version}.${fileType}`;
}
```

---

## 注意事項・制約

1. **テンプレート原本は絶対に上書きしない** — Supabase Storage の `templates` バケットは書き込みを admin に限定。生成物は別バケット `documents` に保存する。
2. **同一案件・同一テンプレートの再生成** — `document_histories` に新バージョンとして INSERT（v1, v2, ...）。既存ファイルの上書き禁止。
3. **実行時間とメモリ** — Vercel Serverless Functions の制約（デフォルト 10〜60 秒、メモリ 1〜3GB）を意識。`.xlsx` で数十シートや巨大な画像を含む場合は要検証。必要なら `runtime = "nodejs"` + `maxDuration` を Route Handler / Server Action で明示。
4. **文字コード** — `.docx` / `.xlsx` は内部 UTF-8。旧 `.doc` / `.xls` の Shift-JIS 問題はローカル変換時に対応。
5. **`.doc` / `.xls` 拡張子のアップロード拒否** — `uploadTemplate` で拡張子チェックし、「事前に `.docx` / `.xlsx` に変換してからアップロードしてください」のエラーを返す。
6. **ハイライト方針** — 当面は「テンプレ側で該当 Run を黄色ハイライト済みにしておく」運用（3-A 方式）。

---

## Phase 3 の実装スコープ（本ドキュメント）

- [x] TransferContext 型と組み立て関数
- [x] `fillDocx`（docxtemplater ベース、ハイライト 3-A 方式）
- [x] `fillXlsx`（exceljs ベース、単一セル置換）
- [x] 転記前チェック（preCheck）
- [x] ファイル命名規則
- [x] Excel 行増殖（`loop_*_start` / `loop_*_end` 名前定義）
- [ ] Word のハイライト 3-B 方式（html-module）— 要件の強さ次第で追加
