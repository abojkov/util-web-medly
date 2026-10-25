// Native PDF preview regression with a valid synthetic one-page PDF.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
function pdf() {
  const content = "BT /F1 24 Tf 45 110 Td (Synthetic Medly preview) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(source).toString("base64");
}
(async () => {
  const browser = await chromium.launch({
    ...(process.env.MEDLY_BROWSER
      ? { channel: process.env.MEDLY_BROWSER }
      : {}),
    headless: true,
  });
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 1000 },
  });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await page
      .getByRole("heading", { name: "Your health, together." })
      .waitFor();
    const id = await page.evaluate(async (base64) => {
      const blob = new Blob(
        [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
        { type: "application/pdf" },
      );
      const { validateFile } = await import("./assets/js/utils/validation.js");
      await validateFile(blob);
      const saved = await (
        await import("./assets/js/db/repository.js")
      ).saveRecord("documents", {
        name: "Synthetic preview.pdf",
        issueDate: "2018-02-03",
        blob,
        type: blob.type,
        size: blob.size,
      });
      return saved.id;
    }, pdf());
    await page.goto(`${baseURL}/#/documents/${id}`);
    await page.locator("[data-preview]").click();
    const iframe = page.locator("#document-preview iframe");
    assert.equal(await iframe.getAttribute("sandbox"), null);
    assert.equal(await iframe.getAttribute("title"), "Synthetic preview.pdf");
    const source = await iframe.getAttribute("src");
    assert(source.startsWith("blob:"));
    const open = page.getByRole("link", {
      name: "Open PDF in new tab",
      exact: true,
    });
    assert.equal(await open.getAttribute("href"), source);
    assert.equal(await open.getAttribute("rel"), "noopener noreferrer");
    await iframe.scrollIntoViewIfNeeded();
    await page
      .waitForEvent("framenavigated", {
        predicate: (f) => f.url().startsWith("chrome-extension://"),
        timeout: 5000,
      })
      .catch(() => {});
    const viewer = page
      .frames()
      .find((f) => f.url().startsWith("chrome-extension://"));
    assert(viewer, "Chrome native PDF viewer did not start");
    await viewer.waitForSelector("pdf-viewer", { state: "attached" });
    await viewer.waitForFunction(
      () => document.querySelector("pdf-viewer")?.loadState_ === "success",
      { timeout: 10000 },
    );
    await page.screenshot({
      path: "/tmp/medly-pdf-preview-chrome.png",
      fullPage: true,
    });
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      open.click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    assert.equal(popup.url(), source);
    assert.equal(await popup.evaluate(() => Boolean(window.opener)), false);
    await popup.close();
    console.log(
      "PASS Chrome native PDF embed loads from local blob with no iframe sandbox; separate-tab fallback works without opener access",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
