// テンプレート・マッピング手順書用の注釈入りスクリーンショットを撮影するスクリプト。
//
// 使い方:
//   1) 別ターミナルで開発サーバーを起動: pnpm dev --hostname 127.0.0.1 --port 3100
//   2) node --env-file=.env.local scripts/capture-mapping-guide-screenshots.mjs
//
// 番号バッジ・ハイライト枠・矢印を実DOMの座標に合わせて重ねてから撮影する。
// AIマッピング候補パネルは手順書では扱わないため、撮影時に非表示にする。

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3100";
const EMAIL = process.env.SCREENSHOT_EMAIL ?? "dev@n-grust.co.jp";
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? "DreaMs2026!";
const WORD_TEMPLATE_ID = process.env.WORD_TEMPLATE_ID ?? "41";
const EXCEL_TEMPLATE_ID = process.env.EXCEL_TEMPLATE_ID ?? "5";

const OUTPUT_DIR = path.resolve(
  process.cwd(),
  "docs/user-manual/assets/template-mapping-guide",
);

const VIEWPORT = { width: 1440, height: 960 };

function log(message) {
  process.stdout.write(`• ${message}\n`);
}

async function waitStable(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(async () => {
    if ("fonts" in document) await document.fonts.ready;
  });
  await page.waitForTimeout(350);
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await waitStable(page);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: "メールアドレスでログインする" }).click();
  await page
    .getByRole("heading", { name: "ダッシュボード", exact: true })
    .waitFor({ timeout: 60_000 });
  await waitStable(page);
  log("ログイン完了");
}

// AIマッピング候補パネルを画面から隠す（手順書では扱わないため）。
async function hideAiPanel(page) {
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("p")].find(
      (p) => p.textContent?.trim() === "AIマッピング候補",
    );
    const panel = heading?.closest("div.shrink-0");
    if (panel instanceof HTMLElement) {
      panel.dataset.guideHidden = "true";
      panel.style.display = "none";
    }
  });
}

// 注釈オーバーレイを実DOM座標に合わせて描画する。
// items: { rect:{x,y,width,height}, n?, place?, label?, color?, pad? }
async function annotate(page, items) {
  await page.evaluate((annotations) => {
    document.getElementById("__guide_overlay__")?.remove();
    const root = document.createElement("div");
    root.id = "__guide_overlay__";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
    });

    for (const a of annotations) {
      const color = a.color ?? "#ff3b30";
      const pad = a.pad ?? 4;
      const r = a.rect;
      if (!r) continue;
      const x = r.x - pad;
      const y = r.y - pad;
      const w = r.width + pad * 2;
      const h = r.height + pad * 2;

      const ring = document.createElement("div");
      Object.assign(ring.style, {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        border: `3px solid ${color}`,
        borderRadius: "7px",
        boxShadow: `0 0 0 3px rgba(255,59,48,0.22)`,
        boxSizing: "border-box",
      });
      root.appendChild(ring);

      if (a.n != null) {
        const badge = document.createElement("div");
        badge.textContent = String(a.n);
        const place = a.place ?? "tl";
        const bx =
          place === "tr" || place === "br" ? x + w - 14 : x - 14;
        const by =
          place === "bl" || place === "br" ? y + h - 14 : y - 14;
        Object.assign(badge.style, {
          position: "absolute",
          left: `${bx}px`,
          top: `${by}px`,
          width: "28px",
          height: "28px",
          borderRadius: "9999px",
          background: color,
          color: "#ffffff",
          font: "700 16px/28px 'Noto Sans JP', sans-serif",
          textAlign: "center",
          border: "2px solid #ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          boxSizing: "border-box",
        });
        root.appendChild(badge);
      }

      if (a.label) {
        const tag = document.createElement("div");
        tag.textContent = a.label;
        const onTop = a.labelPlace !== "bottom";
        Object.assign(tag.style, {
          position: "absolute",
          left: `${x}px`,
          top: onTop ? `${y - 30}px` : `${y + h + 6}px`,
          maxWidth: `${Math.max(w, 160)}px`,
          background: color,
          color: "#ffffff",
          font: "600 12px/1.5 'Noto Sans JP', sans-serif",
          padding: "2px 8px",
          borderRadius: "5px",
          whiteSpace: "nowrap",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        });
        root.appendChild(tag);
      }
    }

    document.body.appendChild(root);
  }, items);
}

async function clearAnnotations(page) {
  await page.evaluate(() => document.getElementById("__guide_overlay__")?.remove());
}

async function rectOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("要素のboundingBoxを取得できませんでした");
  return box;
}

async function shot(page, name) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUTPUT_DIR, name),
    animations: "disabled",
    caret: "hide",
  });
  log(`保存: ${name}`);
}

async function openMapping(page, templateId) {
  await page.goto(`${BASE_URL}/templates/${templateId}/mapping`, {
    waitUntil: "domcontentloaded",
  });
  await waitStable(page);
  await hideAiPanel(page);
  await page.waitForTimeout(200);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const page = await context.newPage();

  try {
    await login(page);

    // ---- 01 テンプレート一覧 ----
    await page.goto(`${BASE_URL}/templates`, { waitUntil: "domcontentloaded" });
    await waitStable(page);
    {
      const nav = page.getByRole("link", { name: "テンプレート" }).first();
      const mappingOpen = page.getByRole("link", { name: "マッピングを開く" }).first();
      const mappingCell = page.locator("tbody tr").first().getByText(/件$/).first();
      const items = [];
      try {
        items.push({ rect: await rectOf(nav), n: 1, place: "tl" });
      } catch {}
      try {
        items.push({ rect: await rectOf(mappingCell), n: 2, place: "tl" });
      } catch {}
      try {
        items.push({ rect: await rectOf(mappingOpen), n: 3, place: "tr" });
      } catch {}
      await annotate(page, items);
      await shot(page, "01-template-list.png");
      await clearAnnotations(page);
    }

    // ---- 02 新規アップロード ----
    await page.goto(`${BASE_URL}/templates/new`, { waitUntil: "domcontentloaded" });
    await waitStable(page);
    {
      const items = [];
      const fileInput = page.locator('input[type="file"]').first();
      try {
        const lbl = page.locator("label", { hasText: /ファイル|様式ファイル/ }).first();
        items.push({ rect: await rectOf(lbl), n: 1, place: "tl" });
      } catch {}
      try {
        const nameField = page.getByLabel(/様式名/).first();
        items.push({ rect: await rectOf(nameField), n: 2, place: "tl" });
      } catch {}
      await annotate(page, items);
      await shot(page, "02-template-upload.png");
      await clearAnnotations(page);
    }

    // ---- 03 テンプレート詳細（マッピング作業画面を開く）----
    await page.goto(`${BASE_URL}/templates/${WORD_TEMPLATE_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await waitStable(page);
    {
      const openBtnHeader = page
        .getByRole("link", { name: "マッピング作業画面を開く" })
        .first();
      const items = [{ rect: await rectOf(openBtnHeader), n: 1, place: "tr" }];
      await annotate(page, items);
      await shot(page, "03-template-detail.png");
      await clearAnnotations(page);
    }

    // ---- 04 マッピング画面 全体構成（Word）----
    await openMapping(page, WORD_TEMPLATE_ID);
    {
      const sections = page.locator("div.grid > section");
      const preview = sections.nth(0);
      const mapping = sections.nth(1);
      const dict = sections.nth(2);
      const progress = page.locator('[role="progressbar"]').first();
      const items = [];
      try {
        items.push({ rect: await rectOf(preview), n: 1, place: "tl", pad: 0 });
      } catch {}
      try {
        items.push({ rect: await rectOf(mapping), n: 2, place: "tl", pad: 0 });
      } catch {}
      try {
        items.push({ rect: await rectOf(dict), n: 3, place: "tr", pad: 0 });
      } catch {}
      try {
        items.push({ rect: await rectOf(progress), color: "#1a73e8", pad: 6 });
      } catch {}
      await annotate(page, items);
      await shot(page, "04-mapping-overview.png");
      await clearAnnotations(page);
    }

    // ---- 05 Word: プレビューの差し込み名をクリック ----
    {
      const placeholder = page.locator('section button[title^="{"]').nth(2);
      await placeholder.scrollIntoViewIfNeeded();
      await placeholder.click();
      await page.waitForTimeout(300);
      const activeRow = page.locator("tbody tr[data-selected]").first();
      const items = [{ rect: await rectOf(placeholder), n: 1, place: "tl" }];
      try {
        items.push({ rect: await rectOf(activeRow), n: 2, place: "tr" });
      } catch {}
      await annotate(page, items);
      await shot(page, "05-word-select.png");
      await clearAnnotations(page);
    }

    // ---- 06 Word: フィールド辞書で検索して選ぶ ----
    {
      const search = page.getByPlaceholder("氏名、住所、caseNumber...").first();
      await search.fill("氏名");
      await page.waitForTimeout(300);
      const dictSection = page.locator("div.grid > section").nth(2);
      const firstField = dictSection.locator("button").filter({ hasText: /氏名|名/ }).first();
      const fieldInput = page.getByPlaceholder("右の辞書から選択").first();
      const items = [];
      try {
        items.push({ rect: await rectOf(search), n: 1, place: "tl" });
      } catch {}
      try {
        items.push({ rect: await rectOf(firstField), n: 2, place: "tr" });
      } catch {}
      try {
        items.push({ rect: await rectOf(fieldInput), n: 3, place: "tl" });
      } catch {}
      await annotate(page, items);
      await shot(page, "06-word-dictionary.png");
      await clearAnnotations(page);
    }

    // ---- 07 Word: 表示名・必須・保存 ----
    {
      const requiredCheckbox = page.locator('label:has-text("必須") input[type="checkbox"]').first();
      const saveBtn = page.getByRole("button", { name: "保存する" }).first();
      const items = [];
      try {
        // 表示名入力（label テキストで特定）
        const labelField = page.locator('label:has-text("表示名") input').first();
        items.push({ rect: await rectOf(labelField), n: 1, place: "tl" });
      } catch {}
      try {
        items.push({ rect: await rectOf(requiredCheckbox), n: 2, place: "tl", pad: 6 });
      } catch {}
      try {
        items.push({ rect: await rectOf(saveBtn), n: 3, place: "tr" });
      } catch {}
      await annotate(page, items);
      await shot(page, "07-word-confirm-save.png");
      await clearAnnotations(page);
    }

    // ---- 08 Excel: セルをクリックして行を作る ----
    await openMapping(page, EXCEL_TEMPLATE_ID);
    {
      const cell = page.locator("section button[data-cell-target]").filter({ hasText: /\S/ }).nth(3);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await page.waitForTimeout(300);
      const newRow = page.locator("tbody tr[data-selected]").first();
      const items = [{ rect: await rectOf(cell), n: 1, place: "tl" }];
      try {
        items.push({ rect: await rectOf(newRow), n: 2, place: "tr" });
      } catch {}
      await annotate(page, items);
      await shot(page, "08-excel-cell-click.png");
      await clearAnnotations(page);
    }

    // ---- 09 Excel: 辞書からフィールドを選び保存 ----
    {
      const search = page.getByPlaceholder("氏名、住所、caseNumber...").first();
      await search.fill("氏名");
      await page.waitForTimeout(300);
      const dictSection = page.locator("div.grid > section").nth(2);
      const firstField = dictSection.locator("button").first();
      await firstField.click().catch(() => {});
      await page.waitForTimeout(300);
      const completedRow = page.locator("tbody tr[data-selected]").first();
      const saveBtn = page.getByRole("button", { name: "保存する" }).first();
      const items = [];
      try {
        items.push({ rect: await rectOf(dictSection.locator("button").first()), n: 1, place: "tr" });
      } catch {}
      try {
        items.push({ rect: await rectOf(completedRow), n: 2, place: "tr" });
      } catch {}
      try {
        items.push({ rect: await rectOf(saveBtn), n: 3, place: "tr" });
      } catch {}
      await annotate(page, items);
      await shot(page, "09-excel-field-save.png");
      await clearAnnotations(page);
    }

    // ---- 10 新バージョンをアップロード ----
    await page.goto(`${BASE_URL}/templates/${WORD_TEMPLATE_ID}/new-version`, {
      waitUntil: "domcontentloaded",
    });
    await waitStable(page);
    {
      const items = [];
      try {
        const fileLabel = page.locator("label", { hasText: /ファイル/ }).first();
        items.push({ rect: await rectOf(fileLabel), n: 1, place: "tl" });
      } catch {}
      await annotate(page, items);
      await shot(page, "10-new-version.png");
      await clearAnnotations(page);
    }

    log("すべての撮影が完了しました");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
