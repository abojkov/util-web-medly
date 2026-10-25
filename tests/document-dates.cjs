// Synthetic issue-date migration and document UI regression checks.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
const meta = () => ({
  id: randomUUID(),
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T12:00:00.000Z",
});
const data = Object.fromEntries(
  [
    "visits",
    "diagnoses",
    "treatments",
    "medications",
    "doctors",
    "clinics",
    "documents",
    "appointments",
  ].map((name) => [name, []]),
);
const visit = {
  ...meta(),
  reason: "Synthetic historical visit",
  date: "2018-02-03T10:00",
  type: "Other",
};
data.visits.push(visit);
const pdf = "%PDF-1.4\nSynthetic historical report\n%%EOF";
for (let i = 0; i < 3; i++)
  data.documents.push({
    ...meta(),
    name: `Synthetic report ${i}.pdf`,
    visitId: i < 2 ? visit.id : "",
    type: "application/pdf",
    size: pdf.length,
    base64: Buffer.from(pdf).toString("base64"),
  });
const backup = {
  format: "medly-backup",
  schemaVersion: 5,
  appVersion: "1.4.3",
  exportedAt: "2026-10-25T12:00:00.000Z",
  data,
};
(async () => {
  const browser = await chromium.launch({
    ...(process.env.MEDLY_BROWSER
      ? { channel: process.env.MEDLY_BROWSER }
      : {}),
    headless: true,
  });
  try {
    for (const fail of [false, true]) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        await page.route("**/date-fixture.html", (r) =>
          r.fulfill({
            contentType: "text/html",
            body: "<!doctype html><title>Synthetic fixture</title>",
          }),
        );
        await page.goto(`${baseURL}/date-fixture.html`);
        await page.evaluate(async (backup) => {
          await new Promise((resolve, reject) => {
            const request = indexedDB.open("medly", 5);
            request.onupgradeneeded = () => {
              for (const name of Object.keys(backup.data))
                request.result.createObjectStore(name, { keyPath: "id" });
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction(Object.keys(backup.data), "readwrite");
              for (const [name, records] of Object.entries(backup.data))
                for (const record of records) {
                  const value = { ...record };
                  if (name === "documents") {
                    value.blob = new Blob([atob(value.base64)], {
                      type: value.type,
                    });
                    delete value.base64;
                  }
                  tx.objectStore(name).put(value);
                }
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onabort = () => reject(tx.error);
            };
          });
        }, backup);
        if (fail)
          await page.addInitScript(() => {
            const put = IDBObjectStore.prototype.put;
            const counts = new WeakMap();
            IDBObjectStore.prototype.put = function (...args) {
              if (
                this.name === "documents" &&
                this.transaction.mode === "versionchange"
              ) {
                const count = (counts.get(this.transaction) || 0) + 1;
                counts.set(this.transaction, count);
                if (count === 2)
                  throw new DOMException(
                    "Synthetic failure",
                    "QuotaExceededError",
                  );
              }
              return put.apply(this, args);
            };
          });
        await page.goto(baseURL);
        if (fail) {
          await page
            .getByRole("heading", { name: "Your archive could not be opened" })
            .waitFor();
          const stored = await page.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const r = indexedDB.open("medly");
                r.onerror = () => reject(r.error);
                r.onsuccess = () => {
                  const db = r.result,
                    tx = db.transaction("documents");
                  tx.objectStore("documents").getAll().onsuccess = (e) => {
                    resolve({
                      version: db.version,
                      hasIndex: tx
                        .objectStore("documents")
                        .indexNames.contains("issueDate"),
                      dates: e.target.result.map((d) => d.issueDate),
                    });
                    db.close();
                  };
                };
              }),
          );
          assert.equal(stored.version, 5);
          assert.equal(stored.hasIndex, false);
          assert(stored.dates.every((date) => date === undefined));
          console.log(
            "PASS failed document-date upgrade rolls back records and schema",
          );
          continue;
        }
        await page
          .getByRole("heading", { name: "Your health, together." })
          .waitFor();
        await page.evaluate(async (backup) => {
          const { snapshot, openDatabase } = await import(
            "./assets/js/db/database.js"
          );
          const { events } = await import("./assets/js/services/history.js");
          const { createBackup, parseBackup, importBackup } = await import(
            "./assets/js/services/backup.js"
          );
          const current = await createBackup();
          if (
            current.schemaVersion !== 6 ||
            (await openDatabase()).version !== 6
          )
            throw Error("Wrong schema");
          for (const original of backup.data.documents) {
            const migrated = current.data.documents.find(
              (d) => d.id === original.id,
            );
            const expected = {
              ...original,
              ...(original.visitId ? { issueDate: "2018-02-03" } : {}),
            };
            if (
              Object.keys(migrated).length !== Object.keys(expected).length ||
              Object.entries(expected).some(
                ([key, value]) => migrated[key] !== value,
              )
            )
              throw Error("Migration changed attachment or audit data");
          }
          const history = events(await snapshot());
          if (
            history.some(
              (e) =>
                e.store === "documents" &&
                e.record.visitId &&
                e.date !== "2018-02-03",
            )
          )
            throw Error("Historical document uses upload date");
          if (
            !history.some(
              (e) =>
                e.store === "documents" &&
                !e.record.visitId &&
                e.label === "Document added (issue date unknown)",
            )
          )
            throw Error("Unknown issue date is not labeled");
          await importBackup(await parseBackup(backup), "replace");
          if (
            JSON.stringify((await createBackup()).data) !==
            JSON.stringify(current.data)
          )
            throw Error("Legacy backup dates differ from upgrade");
          const invalid = await createBackup();
          invalid.data.documents[0].issueDate = "2018-02-31";
          await parseBackup(invalid).then(
            () => {
              throw Error("Invalid issue date accepted");
            },
            () => {},
          );
        }, backup);
        await page.goto(`${baseURL}/#/visits/${visit.id}`);
        await page.locator('[data-add="documents"]').click();
        assert.equal(
          await page.locator("#field-issueDate").inputValue(),
          "2018-02-03",
        );
        await page.locator("#field-issueDate").fill("2018-02-05");
        await page.locator("#document-file").setInputFiles({
          name: "Synthetic new report.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(pdf),
        });
        await page.locator('#record-form button[type="submit"]').click();
        await page
          .getByRole("heading", {
            name: "Synthetic new report.pdf",
            exact: true,
          })
          .waitFor();
        await page.locator('[data-edit][data-store="documents"]').click();
        assert.equal(
          await page.locator("#field-issueDate").inputValue(),
          "2018-02-05",
        );
        await page.locator("#field-issueDate").fill("2017-12-31");
        await page.locator('#record-form button[type="submit"]').click();
        await page.waitForFunction(
          () => !document.querySelector("#modal").open,
        );
        await page.evaluate(async () => {
          const data = await (
            await import("./assets/js/db/database.js")
          ).snapshot();
          const { events } = await import("./assets/js/services/history.js");
          if (
            !events(data).some(
              (e) =>
                e.title === "Synthetic new report.pdf" &&
                e.date === "2017-12-31",
            )
          )
            throw Error("Timeline ignores edited issue date");
          const { createBackup, parseBackup, importBackup } = await import(
            "./assets/js/services/backup.js"
          );
          const backup = await createBackup();
          await importBackup(await parseBackup(backup), "replace");
          if (
            JSON.stringify((await createBackup()).data) !==
            JSON.stringify(backup.data)
          )
            throw Error("Issue date backup round trip changed data");
        });
        console.log(
          "PASS historical visit date defaults, editable issue dates, timeline dates, attachment preservation and legacy/current backups",
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
