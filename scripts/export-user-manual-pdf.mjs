import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const projectRoot = process.cwd();
const markdownPath = path.join(projectRoot, "docs/user-manual/operation-manual.md");
const htmlPath = path.join(projectRoot, "docs/user-manual/operation-manual.print.html");
const pdfPath = path.join(projectRoot, "docs/user-manual/operation-manual.pdf");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function parseMarkdown(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }

  function flushList() {
    if (list.length === 0) return;
    blocks.push({ type: "list", items: [...list] });
    list = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    const imageMatch = line.match(/^!\[(.*)\]\((.*)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "image",
        alt: imageMatch[1],
        src: imageMatch[2],
      });
      continue;
    }

    const listMatch = line.match(/^- (.+)$/);
    if (listMatch) {
      flushParagraph();
      list.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function groupSections(blocks) {
  const intro = [];
  const sections = [];
  let current = null;

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      current = { heading: block, blocks: [] };
      sections.push(current);
      continue;
    }

    if (current) current.blocks.push(block);
    else intro.push(block);
  }

  return { intro, sections };
}

async function imageToDataUri(src) {
  const filePath = path.resolve(path.dirname(markdownPath), src);
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "application/octet-stream";

  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function renderBlocks(blocks) {
  const parts = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block.type === "heading") {
      const tag = `h${Math.min(block.level, 6)}`;
      parts.push(`<${tag}>${inlineMarkdown(block.text)}</${tag}>`);
      continue;
    }

    if (block.type === "paragraph") {
      const next = blocks[i + 1];
      const isFigureLabel = block.text.endsWith(":") && next?.type === "image";
      const className = isFigureLabel ? ' class="figure-label"' : "";
      parts.push(`<p${className}>${inlineMarkdown(block.text)}</p>`);
      continue;
    }

    if (block.type === "list") {
      parts.push(
        `<ul>${block.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    if (block.type === "image") {
      const dataUri = await imageToDataUri(block.src);
      parts.push(
        [
          '<figure class="doc-figure">',
          `<img src="${dataUri}" alt="${escapeHtml(block.alt)}" />`,
          `<figcaption>${inlineMarkdown(block.alt)}</figcaption>`,
          "</figure>",
        ].join(""),
      );
    }
  }

  return parts.join("\n");
}

async function buildHtml(markdown) {
  const blocks = parseMarkdown(markdown);
  const { intro, sections } = groupSections(blocks);
  const introHtml = await renderBlocks(intro);

  const sectionHtml = await Promise.all(
    sections.map(async (section, index) => {
      const content = await renderBlocks(section.blocks);
      return [
        `<section class="doc-section${index === 0 ? " first-section" : ""}">`,
        `<h2>${inlineMarkdown(section.heading.text)}</h2>`,
        content,
        "</section>",
      ].join("\n");
    }),
  );

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>案件管理・帳票転記システム 利用説明書</title>
    <style>
      :root {
        --ink: #1f2937;
        --muted: #4b5563;
        --line: #d1d5db;
        --accent: #0f172a;
        --surface: #f8fafc;
      }

      * {
        box-sizing: border-box;
      }

      html {
        font-size: 14px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        margin: 0;
        color: var(--ink);
        font-family:
          "Noto Sans JP",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Yu Gothic",
          sans-serif;
        line-height: 1.7;
      }

      main {
        margin: 0 auto;
      }

      h1,
      h2,
      h3 {
        color: var(--accent);
        line-height: 1.35;
        margin: 0;
      }

      h1 {
        font-size: 24px;
        margin-bottom: 8px;
      }

      h2 {
        font-size: 18px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 6px;
        margin-bottom: 14px;
      }

      h3 {
        font-size: 15px;
        margin-top: 18px;
        margin-bottom: 8px;
      }

      p,
      ul,
      figure {
        margin: 0 0 12px 0;
      }

      ul {
        padding-left: 20px;
      }

      li + li {
        margin-top: 4px;
      }

      code {
        background: #eef2f7;
        border: 1px solid #dbe2ea;
        border-radius: 4px;
        padding: 1px 5px;
        font-size: 0.92em;
      }

      .cover {
        margin-bottom: 20px;
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      }

      .lead {
        color: var(--muted);
        margin-bottom: 0;
      }

      .doc-section {
        break-before: page;
        page-break-before: always;
      }

      .doc-section.first-section {
        break-before: auto;
        page-break-before: auto;
      }

      .doc-section > *:first-child,
      .doc-section h3,
      .figure-label,
      .doc-figure,
      ul {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .figure-label {
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 8px;
      }

      .doc-figure {
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
      }

      .doc-figure img {
        display: block;
        width: 100%;
        height: auto;
        max-height: 220mm;
        margin: 0 auto;
        object-fit: contain;
        border-radius: 4px;
        background: white;
      }

      .doc-figure figcaption {
        margin-top: 8px;
        font-size: 12px;
        color: var(--muted);
        text-align: center;
      }

      @page {
        size: A4;
        margin: 14mm 14mm 18mm 14mm;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="cover">
        ${introHtml}
      </section>
      ${sectionHtml.join("\n")}
    </main>
  </body>
</html>`;
}

async function main() {
  const markdown = await fs.readFile(markdownPath, "utf8");
  const html = await buildHtml(markdown);

  await fs.writeFile(htmlPath, html, "utf8");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%; font-size:8px; padding:0 10mm; color:#6b7280; display:flex; justify-content:space-between;">
          <span>案件管理・帳票転記システム 利用説明書</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      `,
    });
  } finally {
    await browser.close();
  }

  console.log(`HTML: ${pathToFileURL(htmlPath).href}`);
  console.log(`PDF:  ${pathToFileURL(pdfPath).href}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
