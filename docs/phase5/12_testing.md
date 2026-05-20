# Phase 5-2: テスト仕様・受入基準

## テスト方針

本システムのテストは以下の 3 層で構成する。

| テスト種別 | ツール | 対象 |
|---|---|---|
| ユニットテスト | **Vitest** | 転記エンジン・コンテキスト組み立て・正規化・和暦変換・zod スキーマ |
| 結合テスト | **Vitest**（Supabase をローカルで起動） | Server Actions（DB 込み） |
| E2E テスト | **Playwright** | 主要ユーザーフロー（ログイン・案件登録・帳票生成） |

- CI（GitHub Actions）で PR ごとに Lint + Type-check + ユニット・結合を実行
- E2E はローカル or Vercel Preview に対して手動 or スケジュール実行
- カバレッジ目標：**ビジネスロジック（転記・採番・バリデーション）で 80% 以上**、UI は最低限

---

## 前提セットアップ

```bash
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/dom happy-dom
pnpm add -D @playwright/test
pnpm dlx playwright install --with-deps
```

`vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

---

## ユニットテスト

### 転記エンジン

```ts
// tests/unit/transfer/engine.test.ts
import { describe, it, expect } from "vitest";
import { resolvePath } from "@/lib/transfer/engine";

describe("resolvePath", () => {
  it("ネストしたキーを解決できる", () => {
    expect(resolvePath({ applicant: { name: "田中太郎" } }, "applicant.name"))
      .toBe("田中太郎");
  });

  it("配列インデックスを解決できる", () => {
    const data = { parcels: [{ chiban: "123-4" }, { chiban: "456-7" }] };
    expect(resolvePath(data, "parcels[0].chiban")).toBe("123-4");
    expect(resolvePath(data, "parcels[1].chiban")).toBe("456-7");
  });

  it("存在しないパスは空文字を返す", () => {
    expect(resolvePath({ applicant: { name: "田中太郎" } }, "agent.name"))
      .toBe("");
  });
});
```

```ts
// tests/unit/transfer/docx.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fillDocx } from "@/lib/transfer/docx";
import type { TransferContext } from "@/types/transfer";

describe("fillDocx", () => {
  it("単純な差し込みが成功する", () => {
    const template = readFileSync("tests/fixtures/simple-template.docx").buffer;
    const ctx = makeSampleContext();
    const result = fillDocx(template, ctx, [], false);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("パスホルダー未定義は空文字で埋まる", () => {
    const template = readFileSync("tests/fixtures/missing-field.docx").buffer;
    const ctx = makeSampleContext();
    const result = fillDocx(template, ctx, [], false);
    // ZIP を展開して word/document.xml に "undefined" が含まれないこと
    // ...
  });
});

function makeSampleContext(): TransferContext {
  return {
    caseNumber: "2026-FC-001",
    caseName: "テスト農地転用",
    caseTypeLabel: "農地転用許可",
    submissionTarget: "豊川市農業委員会",
    submissionDate: "", deadlineDate: "",
    today: "令和8年4月23日", todayYear: "令和8年", todayMonth: "4", todayDay: "23",
    applicant: { ...emptyPerson(), name: "田中 太郎", addressFull: "愛知県豊橋市..." },
    transferee: emptyPerson(), transferor: emptyPerson(),
    agent: emptyPerson(), billing: emptyPerson(), neighbor: emptyPerson(),
    applicants: [], neighbors: [],
    parcels: [], parcel: emptyParcel(),
    totalArea: "", totalTenyoArea: "",
    estimateAmount: "", estimateAmountTax: "", estimateAmountTotal: "",
    invoiceAmount: "", invoiceAmountTax: "", invoiceAmountTotal: "",
  };
}
// ... emptyPerson / emptyParcel は省略
```

### 和暦変換

```ts
// tests/unit/transfer/wareki.test.ts
import { describe, it, expect } from "vitest";
import { toWareki } from "@/lib/transfer/format";

describe("toWareki", () => {
  it("2026 年は令和8年", () => {
    expect(toWareki(new Date("2026-04-23"))).toBe("令和8年4月23日");
  });
  it("2019 年は令和1年（令和元年の表記は採用しない）", () => {
    expect(toWareki(new Date("2019-05-01"))).toBe("令和1年5月1日");
  });
  it("2000 年は平成12年", () => {
    expect(toWareki(new Date("2000-01-01"))).toBe("平成12年1月1日");
  });
});
```

### コンテキスト組み立て

```ts
// tests/unit/transfer/context-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildPersonContext } from "@/lib/transfer/context-builder";

describe("buildPersonContext", () => {
  it("スナップショットから住所を結合する", () => {
    const cp = {
      snapshot_name: "田中 太郎",
      snapshot_address_pref: "愛知県",
      snapshot_address_city: "豊橋市",
      snapshot_address_town: "大岩町",
      snapshot_address_line1: "字大穴1-1",
      snapshot_address_line2: null,
    } as any;
    const p = buildPersonContext(cp);
    expect(p.addressFull).toBe("愛知県豊橋市大岩町字大穴1-1");
    expect(p.addressNoPref).toBe("豊橋市大岩町字大穴1-1");
  });
});
```

### 氏名正規化

```ts
// tests/unit/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeName } from "@/lib/normalize";

describe("normalizeName", () => {
  it("全角スペースを除去する", () => {
    expect(normalizeName("田中　太郎")).toBe("田中太郎");
  });
  it("半角スペース・中点を除去する", () => {
    expect(normalizeName("田中 ・ 太郎")).toBe("田中太郎");
  });
  it("全角英数字を半角化する", () => {
    expect(normalizeName("ＡＢＣ１２３")).toBe("abc123");
  });
});
```

---

## 結合テスト（Server Actions + ローカル Supabase）

```bash
# ローカル Supabase を起動
pnpm dlx supabase start

# テスト実行（テスト専用 DB にマイグレーションと seed を流してから）
pnpm test
```

```ts
// tests/integration/persons.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createPerson, findDuplicates } from "@/server/persons";
import { signInAsTestUser, resetDb } from "../helpers";

describe("Server Action: persons", () => {
  beforeEach(async () => {
    await resetDb();
    await signInAsTestUser("user");
  });

  it("個人を登録できる", async () => {
    const res = await createPerson({
      person_type: "individual",
      name: "田中 太郎",
      name_kana: "タナカ タロウ",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBeGreaterThan(0);
  });

  it("重複候補を検出できる", async () => {
    await createPerson({ person_type: "individual", name: "田中 太郎" });
    const res = await findDuplicates("たなかたろう");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.length).toBeGreaterThan(0);
  });
});
```

```ts
// tests/integration/cases.test.ts
describe("Server Action: cases", () => {
  it("案件番号が YYYY-CC-NNN 形式で採番される", async () => {
    const res = await createCase({
      case_name: "テスト案件",
      case_type: "farmland_conversion",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.case_number).toMatch(/^\d{4}-FC-\d{3}$/);
  });

  it("関係者追加でスナップショットが作成される", async () => {
    const person = await createPerson({ /* ... */ });
    const c = await createCase({ /* ... */ });
    if (!person.ok || !c.ok) throw new Error();

    const res = await addCasePerson(c.data.id, {
      person_id: person.data.id,
      role: "applicant",
    });
    expect(res.ok).toBe(true);
    // スナップショットがコピーされていること
    const detail = await getCaseDetail(c.data.id);
    expect(detail.ok).toBe(true);
    // ...
  });
});
```

---

## E2E テスト（Playwright）

```ts
// tests/e2e/case-flow.spec.ts
import { test, expect } from "@playwright/test";

test("案件を作成して帳票を生成する", async ({ page }) => {
  // ログイン（Playwright はテスト用に email + password でログイン。本番 SSO はバイパス）
  await page.goto("/login");
  await page.getByRole("button", { name: "Google アカウントでログイン" }).isVisible();
  // ... テスト用バックドアでセッション Cookie を注入する前提

  // 案件作成
  await page.goto("/cases/new");
  await page.getByLabel("案件名").fill("テスト農地転用");
  await page.getByLabel("案件種別").selectOption("farmland_conversion");
  await page.getByRole("button", { name: "登録する" }).click();

  await expect(page.getByText(/^2\d{3}-FC-\d{3}$/)).toBeVisible();

  // 関係者追加（申請者）
  await page.getByRole("tab", { name: "関係者" }).click();
  await page.getByRole("button", { name: "関係者を追加" }).click();
  // ... 人マスタ検索モーダルで選択 → 役割「申請者」

  // 帳票生成
  await page.getByRole("tab", { name: "帳票生成" }).click();
  await page.getByLabel("様式").selectOption({ label: "5条許可申請書" });
  await page.getByRole("button", { name: "帳票を生成" }).click();
  await expect(page.getByText("ダウンロード")).toBeVisible();
});
```

---

## 受入基準（Acceptance Criteria）

### 人マスタ
- [ ] 個人・法人の登録・編集・削除ができる
- [ ] 郵便番号から住所が自動補完される
- [ ] 氏名の重複候補が表示される
- [ ] 案件に紐付いている人物を削除しようとすると警告が表示される（admin のみ削除可能、一般ユーザーは削除ボタン非表示）

### 案件マスタ
- [ ] 案件番号が `{年度}-{種別コード}-{連番3桁}` で自動採番される
- [ ] 同時に 2 件登録しても番号が重複しない（`next_case_number` の動作確認）
- [ ] 関係者を人マスタから選択して紐付けられる
- [ ] 紐付け時にスナップショットが作成される
- [ ] 人マスタを更新後、案件の関係者欄に「差異あり」が表示される
- [ ] 「マスタから再同期」でスナップショットが更新され、監査ログに記録される
- [ ] 複数筆の土地情報を登録・並び替えできる
- [ ] 地積合計・転用面積合計が自動計算される

### 帳票転記
- [ ] 案件種別に応じた様式のみが選択肢に表示される
- [ ] 転記前チェックで必須フィールドの欠落が検出される
- [ ] 生成ファイルの命名規則が `{案件番号}_{様式名}_{YYYYMMDD}_v{連番}.docx` になっている
- [ ] ハイライト ON の場合、差し込み箇所が黄色で表示される（テンプレ側に事前ハイライトが乗っていれば保持される）
- [ ] 同案件・同テンプレートで 2 回生成するとバージョンが v2 になる
- [ ] テンプレート原本が変更されていない（`templates` バケット上のファイルが書き換わっていない）
- [ ] 生成履歴からダウンロードできる
- [ ] 監査ログに `document.generate` が記録される

### テンプレート管理
- [ ] `.docx` / `.xlsx` ファイルをアップロードできる
- [ ] `.doc` / `.xls` をアップロードするとエラー（事前変換を促すメッセージ）
- [ ] アップロード時にプレースホルダーが自動検出される
- [ ] マッピング設定を保存・編集できる
- [ ] テンプレートを無効化できる
- [ ] 新バージョンアップロード時に旧バージョンのマッピングがコピーされる

### 認証・権限
- [ ] 未ログインユーザーは `/login` 以外にアクセスできない（middleware が `/login` にリダイレクト）
- [ ] Google SSO で `@n-grust.co.jp` ドメインのみログインできる（第一防衛）
- [ ] 一般ユーザーは削除・テンプレート管理・監査ログ閲覧ができない
- [ ] 管理者は全機能にアクセスできる
- [ ] RLS により、service_role キーを使わずにブラウザから機微テーブル（例：監査ログ）を SELECT することはできない

### ダッシュボード
- [ ] 期限超過・期限間近の案件数が指標カードに表示される
- [ ] 期限超過のテーブルが締切日昇順で表示される
- [ ] 請求済み未入金テーブルが表示される
- [ ] 月次推移チャートが過去 12 ヶ月分表示される

---

## CI（GitHub Actions）設定

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request: {}
  push:
    branches: [main]

jobs:
  lint-type-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test -- --run
```

E2E は Vercel Preview URL が必要なため、初期は手動実行。スケジュール実行は Phase 5 後半で検討。
