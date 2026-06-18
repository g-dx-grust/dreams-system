process.env.DOC_TITLE ??= "関係者台帳・案件登録手順書";
process.env.DOC_MARKDOWN_PATH ??= "docs/user-manual/case-persons-guide.md";
process.env.DOC_HTML_PATH ??= "docs/user-manual/case-persons-guide.print.html";
process.env.DOC_PDF_PATH ??= "docs/user-manual/case-persons-guide.pdf";
process.env.DOC_TARGET ??= "関係者台帳 / 案件";
process.env.DOC_AUDIENCE ??= "一般ユーザー";

await import("./export-template-mapping-guide-pdf.mjs");
