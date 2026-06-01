import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { marked } = require("marked");
const { chromium } = require("playwright");

const [markdownPath, pdfPath] = process.argv.slice(2);

if (!markdownPath || !pdfPath) {
  console.error("Usage: node scripts/render_report_pdf.mjs <report.md> <report.pdf>");
  process.exit(1);
}

const htmlPath = pdfPath.replace(/\.pdf$/i, ".html");
const markdown = fs.readFileSync(markdownPath, "utf8");
const body = marked(markdown);

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 18mm 15mm; }
      body {
        color: #172033;
        font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif;
        font-size: 12.5px;
        line-height: 1.58;
      }
      h1 { color: #061526; font-size: 26px; margin: 0 0 18px; }
      h2 {
        border-bottom: 1px solid #d6e0ee;
        color: #0a2a43;
        font-size: 18px;
        margin: 28px 0 10px;
        padding-bottom: 5px;
      }
      h3 { color: #123a5a; font-size: 15px; margin: 20px 0 8px; }
      pre {
        background: #0b1624;
        border-radius: 8px;
        color: #d8ecff;
        font-size: 10.5px;
        padding: 12px;
        white-space: pre-wrap;
      }
      code { font-family: SFMono-Regular, Menlo, Consolas, monospace; }
      ul { padding-left: 20px; }
      li { margin: 4px 0; }
      .cover {
        border-bottom: 3px solid #0f8acb;
        margin-bottom: 12px;
        padding: 18px 0 10px;
      }
      .cover p { color: #50657c; margin: 2px 0; }
    </style>
  </head>
  <body>
    <div class="cover">
      <h1>GCS-SAKER 개발 구조 변경 및 검증 보고서</h1>
      <p>작성일: 2026-06-01</p>
      <p>대상: M2-M7 스트리밍/운영 안정화 개발 흐름</p>
    </div>
    ${body}
  </body>
</html>`;

fs.writeFileSync(htmlPath, html);

const chromeExecutablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const launchOptions = fs.existsSync(chromeExecutablePath)
  ? { executablePath: chromeExecutablePath, headless: true }
  : { headless: true };
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "load" });
await page.pdf({
  displayHeaderFooter: true,
  footerTemplate:
    '<div style="font-size:8px;color:#708399;width:100%;text-align:center">GCS-SAKER 개발 구조 변경 및 검증 보고서 · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  format: "A4",
  headerTemplate: "<div></div>",
  path: pdfPath,
  printBackground: true,
});
await browser.close();

console.log(pdfPath);
