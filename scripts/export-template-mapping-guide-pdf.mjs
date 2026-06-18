import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const projectRoot = process.cwd();
const markdownPath = path.join(
  projectRoot,
  process.env.DOC_MARKDOWN_PATH ?? "docs/user-manual/template-mapping-guide.md",
);
const htmlPath = path.join(
  projectRoot,
  process.env.DOC_HTML_PATH ?? "docs/user-manual/template-mapping-guide.print.html",
);
const pdfPath = path.join(
  projectRoot,
  process.env.DOC_PDF_PATH ?? "docs/user-manual/template-mapping-guide.pdf",
);
const appendixPath = path.join(
  projectRoot,
  process.env.DOC_APPENDIX_PATH ?? "docs/user-manual/template-mapping-fields-appendix.md",
);
const documentTitle = process.env.DOC_TITLE ?? "テンプレート・マッピング作業 手順書";
const documentTarget = process.env.DOC_TARGET ?? "Word / Excel テンプレート";
const documentAudience = process.env.DOC_AUDIENCE ?? "社内スタッフ・管理者";
const documentDate =
  process.env.DOC_EXPORT_DATE ??
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${href}">${label}</a>`;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function isTableRow(line) {
  return /^\|.*\|$/.test(line.trim());
}

function isTableSeparator(line) {
  if (!isTableRow(line)) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdown(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const codeFenceMatch = line.match(/^```([A-Za-z0-9_-]*)$/);
    if (codeFenceMatch) {
      flushParagraph();
      flushList();
      const language = codeFenceMatch[1] ?? "";
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", language, text: codeLines.join("\n") });
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

    if (isTableRow(line) && isTableSeparator(lines[i + 1] ?? "")) {
      flushParagraph();
      flushList();
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const unorderedMatch = line.match(/^- (.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const kind = unorderedMatch ? "unordered" : "ordered";
      if (!list || list.kind !== kind) {
        flushList();
        list = { type: "list", kind, items: [] };
      }
      list.items.push([unorderedMatch?.[1] ?? orderedMatch?.[1] ?? ""]);
      continue;
    }

    const continuationMatch = rawLine.match(/^\s{2,}(.+)$/);
    if (continuationMatch && list?.items.length) {
      list.items[list.items.length - 1].push(continuationMatch[1].trim());
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
      current = { heading: block, blocks: [], id: `section-${sections.length + 1}` };
      sections.push(current);
      continue;
    }

    if (current) current.blocks.push(block);
    else intro.push(block);
  }

  return { intro, sections };
}

function tocTitle(text) {
  return text.replace(/^\d+\.\s+/, "");
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
      const tag = block.kind === "ordered" ? "ol" : "ul";
      parts.push(
        `<${tag}>${block.items
          .map((item) => `<li>${item.map(inlineMarkdown).join("<br />")}</li>`)
          .join("")}</${tag}>`,
      );
      continue;
    }

    if (block.type === "table") {
      parts.push(
        [
          '<div class="table-wrap">',
          "<table>",
          `<thead><tr>${block.headers
            .map((header) => `<th>${inlineMarkdown(header)}</th>`)
            .join("")}</tr></thead>`,
          `<tbody>${block.rows
            .map(
              (row) =>
                `<tr>${block.headers
                  .map((_header, index) => `<td>${inlineMarkdown(row[index] ?? "")}</td>`)
                  .join("")}</tr>`,
            )
            .join("")}</tbody>`,
          "</table>",
          "</div>",
        ].join(""),
      );
      continue;
    }

    if (block.type === "code") {
      parts.push(
        `<pre><code>${escapeHtml(block.text)}</code></pre>`,
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
  const tocHtml = sections
    .map((section) => `<li><a href="#${section.id}">${inlineMarkdown(tocTitle(section.heading.text))}</a></li>`)
    .join("");

  const sectionHtml = await Promise.all(
    sections.map(async (section) => {
      const content = await renderBlocks(section.blocks);
      return [
        `<section id="${section.id}" class="doc-section">`,
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
    <title>${documentTitle}</title>
    <style>
      :root {
        --ink: #172033;
        --muted: #566073;
        --subtle: #717987;
        --line: #d6dae2;
        --accent: #1d4ed8;
        --accent-soft: #edf4ff;
        --surface: #f7f9fc;
        --paper: #ffffff;
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
        background: var(--paper);
        font-family:
          "Noto Sans JP",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Yu Gothic",
          sans-serif;
        line-height: 1.72;
      }

      main {
        width: min(100%, 980px);
        margin: 0 auto;
        padding: 28px 24px 42px;
      }

      h1,
      h2,
      h3 {
        color: #111827;
        line-height: 1.35;
        letter-spacing: 0;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 30px;
      }

      h2 {
        margin: 26px 0 14px;
        padding-bottom: 7px;
        border-bottom: 2px solid var(--line);
        font-size: 20px;
      }

      h3 {
        margin: 20px 0 8px;
        font-size: 16px;
      }

      p,
      ul,
      ol,
      figure,
      .table-wrap,
      pre {
        margin: 0 0 13px;
      }

      ul,
      ol {
        padding-left: 22px;
      }

      li + li {
        margin-top: 5px;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      code {
        display: inline-block;
        max-width: 100%;
        overflow-wrap: anywhere;
        border: 1px solid #dbe4f0;
        border-radius: 4px;
        background: #eef4fb;
        padding: 0 5px;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
        line-height: 1.55;
      }

      pre {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #f4f7fb;
        padding: 12px 14px;
      }

      pre code {
        display: block;
        border: 0;
        background: transparent;
        padding: 0;
      }

      .cover {
        break-after: page;
        margin-bottom: 24px;
        padding: 28px 30px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
      }

      .cover > p {
        color: var(--muted);
        font-size: 15px;
      }

      .meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin: 20px 0;
      }

      .meta-item {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
        padding: 10px 12px;
      }

      .meta-label {
        display: block;
        color: var(--subtle);
        font-size: 11px;
      }

      .meta-value {
        display: block;
        margin-top: 2px;
        color: var(--ink);
        font-size: 13px;
        font-weight: 600;
      }

      .toc {
        margin-top: 22px;
        border-top: 1px solid var(--line);
        padding-top: 18px;
      }

      .toc h2 {
        margin-top: 0;
        border-bottom: 0;
        padding-bottom: 0;
      }

      .toc ol {
        columns: 2;
        column-gap: 32px;
        padding-left: 20px;
      }

      .doc-section {
        margin-bottom: 20px;
      }

      .doc-section > *:first-child,
      h3,
      .figure-label,
      .doc-figure,
      .table-wrap,
      pre {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .figure-label {
        color: #111827;
        font-weight: 700;
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
        max-height: 210mm;
        margin: 0 auto;
        object-fit: contain;
        border: 1px solid #e3e7ee;
        border-radius: 5px;
        background: #ffffff;
      }

      .doc-figure figcaption {
        margin-top: 8px;
        color: var(--muted);
        text-align: center;
        font-size: 12px;
      }

      .table-wrap {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      th,
      td {
        border-bottom: 1px solid var(--line);
        border-right: 1px solid var(--line);
        padding: 8px 9px;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
      }

      th {
        background: var(--accent-soft);
        color: #1f2937;
        font-weight: 700;
      }

      td {
        background: #ffffff;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      th:last-child,
      td:last-child {
        border-right: 0;
      }

      @media print {
        main {
          width: 100%;
          padding: 0;
        }

        .cover {
          min-height: 240mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .doc-section {
          margin-bottom: 16px;
        }

        a {
          color: inherit;
        }
      }

      @page {
        size: A4;
        margin: 14mm 14mm 18mm;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="cover">
        ${introHtml}
        <div class="meta">
          <div class="meta-item">
            <span class="meta-label">作成日</span>
            <span class="meta-value">${escapeHtml(documentDate)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">対象ファイル</span>
            <span class="meta-value">${escapeHtml(documentTarget)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">対象者</span>
            <span class="meta-value">${escapeHtml(documentAudience)}</span>
          </div>
        </div>
        <nav class="toc" aria-label="目次">
          <h2>目次</h2>
          <ol>${tocHtml}</ol>
        </nav>
      </section>
      ${sectionHtml.join("\n")}
    </main>
  </body>
</html>`;
}

async function main() {
  let markdown = await fs.readFile(markdownPath, "utf8");
  const appendix = await fs.readFile(appendixPath, "utf8").catch(() => "");
  if (appendix.trim()) {
    markdown = `${markdown.trim()}\n\n${appendix.trim()}\n`;
  }
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
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%; font-size:8px; padding:0 10mm; color:#6b7280; display:flex; justify-content:space-between; font-family: sans-serif;">
          <span>${documentTitle}</span>
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
