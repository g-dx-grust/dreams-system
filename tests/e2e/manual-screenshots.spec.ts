import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const outputDir = path.resolve(
  process.cwd(),
  process.env.SCREENSHOT_OUTPUT_DIR ?? "docs/user-manual/assets",
);

const credentials = {
  email: process.env.SCREENSHOT_EMAIL ?? process.env.E2E_EMAIL,
  password: process.env.SCREENSHOT_PASSWORD ?? process.env.E2E_PASSWORD,
};

type CaptureTarget = {
  fileName: string;
  url: string;
  heading?: string | RegExp;
  headingTag?: "h1" | "h2" | "h3";
  fullPage?: boolean;
};

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} が未設定です。例: SCREENSHOT_EMAIL=demo@example.com SCREENSHOT_PASSWORD=secret pnpm docs:screenshots`,
    );
  }
  return value;
}

async function waitForStablePage(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    if ("fonts" in document) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function openAndExpect(
  page: Page,
  url: string,
  heading?: string | RegExp,
  headingTag: "h1" | "h2" | "h3" = "h1",
) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForStablePage(page);
  if (heading) {
    const locator = page.locator(headingTag).filter({ hasText: heading }).first();
    await expect(locator).toBeVisible();
    return;
  }
  await expect(page.locator("h1").first()).toBeVisible();
}

async function capture(page: Page, target: CaptureTarget) {
  await test.step(`capture ${target.fileName}`, async () => {
    await openAndExpect(page, target.url, target.heading, target.headingTag);
    await page.screenshot({
      path: path.join(outputDir, target.fileName),
      animations: "disabled",
      caret: "hide",
      fullPage: target.fullPage ?? false,
    });
  });
}

async function loginWithDevelopmentForm(page: Page) {
  const email = requireEnv("SCREENSHOT_EMAIL", credentials.email);
  const password = requireEnv("SCREENSHOT_PASSWORD", credentials.password);

  await openAndExpect(page, "/login", "ログイン", "h2");
  await expect(page.locator("h3").filter({ hasText: "開発環境用ログイン" }).first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByPlaceholder("user@example.com").fill(email);
  await page.getByPlaceholder("パスワード").fill(password);
  await page.getByRole("button", { name: "メールアドレスでログインする" }).click();

  const dashboardHeading = page.getByRole("heading", { name: "ダッシュボード", exact: true });
  const loginErrorMessage = page.getByText(
    /メールアドレスまたはパスワードが正しくありません。|ログインに失敗しました。/,
  );

  try {
    await expect(dashboardHeading).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    if (await loginErrorMessage.isVisible().catch(() => false)) {
      throw new Error(`ログインに失敗しました: ${await loginErrorMessage.innerText()}`);
    }
    throw error;
  }

  await waitForStablePage(page);
}

async function resolveFirstCasePath(page: Page) {
  const explicitCaseId = process.env.SCREENSHOT_CASE_ID;
  if (explicitCaseId) {
    return `/cases/${explicitCaseId}`;
  }

  await openAndExpect(page, "/cases", "案件");

  const emptyState = page.getByText("案件がありません");
  if (await emptyState.isVisible().catch(() => false)) {
    throw new Error(
      "案件データが見つかりません。少なくとも 1 件の案件を作成するか SCREENSHOT_CASE_ID を指定してください。",
    );
  }

  const firstCaseLink = page.locator("tbody a[href^='/cases/']").first();
  await expect(firstCaseLink).toBeVisible();
  const href = await firstCaseLink.getAttribute("href");
  if (!href) {
    throw new Error("案件詳細へのリンクを取得できませんでした。");
  }
  return href;
}

async function resolveFirstTemplatePath(page: Page) {
  const explicitTemplateId = process.env.SCREENSHOT_TEMPLATE_ID;
  if (explicitTemplateId) {
    return `/templates/${explicitTemplateId}`;
  }

  await openAndExpect(page, "/templates", "テンプレート");

  const noPermission = page.getByText("管理者権限が必要です。");
  if (await noPermission.isVisible().catch(() => false)) {
    throw new Error("管理者ユーザーでログインしてください。テンプレート画面の撮影に失敗しました。");
  }

  const emptyState = page.getByText("テンプレートがありません。");
  if (await emptyState.isVisible().catch(() => false)) {
    throw new Error(
      "テンプレートデータが見つかりません。少なくとも 1 件のテンプレートを登録するか SCREENSHOT_TEMPLATE_ID を指定してください。",
    );
  }

  const firstTemplateLink = page.locator("tbody a[href^='/templates/']").first();
  await expect(firstTemplateLink).toBeVisible();
  const href = await firstTemplateLink.getAttribute("href");
  if (!href) {
    throw new Error("テンプレート詳細へのリンクを取得できませんでした。");
  }
  return href;
}

test.describe("manual screenshots", () => {
  test("capture manual assets", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    mkdirSync(outputDir, { recursive: true });

    await capture(page, {
      fileName: "01-login.png",
      url: "/login",
      heading: "ログイン",
      headingTag: "h2",
    });

    await loginWithDevelopmentForm(page);

    const casePath = await resolveFirstCasePath(page);
    const templatePath = await resolveFirstTemplatePath(page);

    const captures: CaptureTarget[] = [
      { fileName: "02-dashboard.png", url: "/", heading: "ダッシュボード" },
      { fileName: "03-cases-list.png", url: "/cases", heading: "案件" },
      { fileName: "04-case-create.png", url: "/cases/new", heading: "案件を登録する" },
      { fileName: "05-case-basic.png", url: casePath },
      { fileName: "06-case-persons.png", url: `${casePath}/persons` },
      { fileName: "07-case-parcels.png", url: `${casePath}/parcels` },
      { fileName: "08-case-financial.png", url: `${casePath}/financial` },
      { fileName: "09-case-documents.png", url: `${casePath}/documents` },
      { fileName: "10-case-history.png", url: `${casePath}/history` },
      { fileName: "11-persons-list.png", url: "/persons", heading: "関係者台帳" },
      { fileName: "12-documents-history.png", url: "/documents", heading: "帳票履歴" },
      { fileName: "13-templates-list.png", url: "/templates", heading: "テンプレート" },
      {
        fileName: "14-template-upload.png",
        url: "/templates/new",
        heading: "テンプレートをアップロード",
      },
      {
        fileName: "15-template-mapping.png",
        url: templatePath,
        fullPage: true,
      },
      { fileName: "16-users-admin.png", url: "/users", heading: "ユーザー管理" },
      { fileName: "17-audit-logs.png", url: "/audit-logs", heading: "監査ログ" },
    ];

    for (const target of captures) {
      await capture(page, target);
    }
  });
});
