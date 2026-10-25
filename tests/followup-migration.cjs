// Preserve old nested episodes while upgrading to one-level follow-ups.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
const meta = () => ({
  id: randomUUID(),
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
});
const data = Object.fromEntries(
  [
    "visits",
    "doctors",
    "clinics",
    "diagnoses",
    "treatments",
    "medications",
    "documents",
    "appointments",
  ].map((store) => [store, []]),
);
const root = {
  ...meta(),
  reason: "Synthetic old episode",
  date: "2026-01-01T10:00",
  type: "General consultation",
  parentVisitId: "",
  notes: "N".repeat(20000),
  followUpInstructions: "I".repeat(20000),
  followUpDate: "2027-01-20",
};
data.visits.push(root);
let parent = root;
for (let i = 1; i <= 4; i++) {
  const visit = {
    ...meta(),
    reason: `Synthetic old review ${i}`,
    date: `2026-01-0${i + 1}T10:00`,
    type: "Follow-up",
    parentVisitId: parent.id,
    findings: `Original findings ${i}`,
    notes: `Original notes ${i}`,
    followUpInstructions: i === 1 ? "Original return advice" : "",
    followUpDate: i === 2 ? "2027-02-01" : "",
  };
  data.visits.push(visit);
  parent = visit;
}
const medicine = { ...meta(), name: "Synthetic old library medicine" };
data.medications.push(medicine);
const course = {
  ...meta(),
  name: "Synthetic old care",
  status: "Completed",
  medicationId: medicine.id,
  dosage: "Original dosage",
  instructions: "Original instructions",
  startDate: "2026-01-05",
};
data.treatments.push(course);
data.visits[4].treatmentIds = [course.id];
const file = "%PDF-1.4\nSynthetic old report\n%%EOF";
data.documents.push({
  ...meta(),
  name: "synthetic-old.pdf",
  type: "application/pdf",
  size: file.length,
  base64: Buffer.from(file).toString("base64"),
  visitId: data.visits[3].id,
});
const backup = {
  format: "medly-backup",
  schemaVersion: 3,
  appVersion: "1.2.0",
  exportedAt: "2026-01-07T12:00:00.000Z",
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
    for (const oldVersion of [3, 4]) {
      for (const fail of [false, true]) {
        const fixture = structuredClone(backup);
        fixture.schemaVersion = oldVersion;
        if (oldVersion === 4)
          for (const visit of fixture.data.visits)
            if (visit.parentVisitId) visit.parentVisitId = root.id;
        const expected = structuredClone(fixture.data);
        for (const visit of expected.visits) {
          if (visit.parentVisitId) visit.parentVisitId = root.id;
          const parts = [
            visit.notes,
            visit.followUpInstructions
              ? `Follow-up instructions: ${visit.followUpInstructions}`
              : "",
            visit.followUpDate
              ? `Recommended review date: ${visit.followUpDate}`
              : "",
          ].filter(Boolean);
          if (parts.length) visit.notes = parts.join("\n\n");
          delete visit.followUpInstructions;
          delete visit.followUpDate;
        }
        for (const records of Object.values(expected))
          records.sort((a, b) => a.id.localeCompare(b.id));
        const context = await browser.newContext({ serviceWorkers: "block" });
        try {
          const page = await context.newPage();
          await page.route("**/migration-fixture.html", (route) =>
            route.fulfill({
              contentType: "text/html",
              body: "<!doctype html><title>Synthetic upgrade fixture</title>",
            }),
          );
          await page.goto(`${baseURL}/migration-fixture.html`);
          await page.evaluate(async (backup) => {
            const data = structuredClone(backup.data);
            for (const file of data.documents) {
              file.blob = new Blob([atob(file.base64)], { type: file.type });
              delete file.base64;
            }
            await new Promise((resolve, reject) => {
              const request = indexedDB.open("medly", backup.schemaVersion);
              request.onupgradeneeded = () => {
                for (const name of Object.keys(data))
                  request.result.createObjectStore(name, { keyPath: "id" });
                request.transaction
                  .objectStore("visits")
                  .createIndex("followUpDate", "followUpDate");
              };
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction(Object.keys(data), "readwrite");
                for (const [name, records] of Object.entries(data))
                  for (const record of records)
                    tx.objectStore(name).put(record);
                tx.oncomplete = () => {
                  db.close();
                  resolve();
                };
                tx.onabort = () => reject(tx.error);
              };
            });
          }, fixture);
          if (fail)
            await page.addInitScript(() => {
              const put = IDBObjectStore.prototype.put,
                counts = new WeakMap();
              IDBObjectStore.prototype.put = function (...args) {
                if (
                  this.name === "visits" &&
                  this.transaction.mode === "versionchange"
                ) {
                  const count = (counts.get(this.transaction) || 0) + 1;
                  counts.set(this.transaction, count);
                  if (count === 2)
                    throw new DOMException(
                      "Synthetic quota failure",
                      "QuotaExceededError",
                    );
                }
                return put.apply(this, args);
              };
            });
          await page.goto(baseURL);
          if (fail) {
            await page
              .getByRole("heading", {
                name: "Your archive could not be opened",
              })
              .waitFor();
            const stored = await page.evaluate(
              () =>
                new Promise((resolve, reject) => {
                  const request = indexedDB.open("medly");
                  request.onerror = () => reject(request.error);
                  request.onsuccess = () => {
                    const db = request.result,
                      tx = db.transaction("visits", "readonly");
                    tx.objectStore("visits").getAll().onsuccess = (event) => {
                      resolve({
                        version: db.version,
                        visits: event.target.result,
                      });
                      db.close();
                    };
                  };
                }),
            );
            assert.equal(stored.version, oldVersion);
            assert.deepEqual(
              stored.visits,
              [...fixture.data.visits].sort((a, b) => a.id.localeCompare(b.id)),
            );
            console.log(
              `PASS failed v${oldVersion}→v5 upgrade rolls back records and schema`,
            );
          } else {
            await page
              .getByRole("heading", { name: "Your health, together." })
              .waitFor();
            const exported = await page.evaluate(async () =>
              (await import("./assets/js/services/backup.js")).createBackup(),
            );
            assert.equal(exported.schemaVersion, 5);
            assert.deepEqual(exported.data, expected);
            await page.evaluate(async () => {
              const { openDatabase } = await import(
                "./assets/js/db/database.js"
              );
              const { snapshot } = await import("./assets/js/db/database.js");
              const { upcoming } = await import(
                "./assets/js/services/history.js"
              );
              const db = await openDatabase();
              if (
                db
                  .transaction("visits")
                  .objectStore("visits")
                  .indexNames.contains("followUpDate")
              )
                throw Error("Retired date index remains");
              if (
                upcoming(await snapshot()).some(
                  (item) => item.store === "visits",
                )
              )
                throw Error("Retired review reminder remains");
            });
            await page.goto(`${baseURL}/#/visits/${root.id}`);
            await page
              .locator(".episode-section .followup-node")
              .first()
              .waitFor();
            assert.equal(
              await page
                .locator(".episode-section > .followup-tree > li")
                .count(),
              4,
            );
            assert.equal(
              await page.locator(".followup-node [data-followup]").count(),
              0,
            );
            await page.evaluate(async (backup) => {
              const { parseBackup, importBackup, createBackup } = await import(
                "./assets/js/services/backup.js"
              );
              const { saveRecord } = await import(
                "./assets/js/db/repository.js"
              );
              const { snapshot } = await import("./assets/js/db/database.js");
              const parsed = await parseBackup(JSON.stringify(backup));
              const invalid = structuredClone(backup);
              invalid.data.visits[0].followUpDate = "invalid date";
              await parseBackup(invalid).then(
                () => {
                  throw Error("Invalid legacy date accepted");
                },
                () => {},
              );
              const invalidText = structuredClone(backup);
              invalidText.data.visits[0].followUpInstructions = 42;
              await parseBackup(invalidText).then(
                () => {
                  throw Error("Invalid legacy instructions accepted");
                },
                () => {},
              );
              const root = parsed.visits.find((visit) => !visit.parentVisitId);
              if (
                parsed.visits.some(
                  (visit) =>
                    visit.parentVisitId && visit.parentVisitId !== root.id,
                )
              )
                throw Error("Old backup was not flattened");
              await importBackup(parsed, "replace");
              await importBackup(parsed, "merge");
              if ((await snapshot()).visits.length !== 5)
                throw Error("Legacy import duplicated visits");
              const cyclic = structuredClone(backup);
              cyclic.data.visits[0].parentVisitId = cyclic.data.visits[4].id;
              let failed = false;
              try {
                await parseBackup(cyclic);
              } catch {
                failed = true;
              }
              if (!failed) throw Error("Cyclic old backup accepted");
              const current = await createBackup();
              const child = current.data.visits.find(
                (visit) => visit.parentVisitId,
              );
              const sibling = current.data.visits.find(
                (visit) => visit.parentVisitId && visit.id !== child.id,
              );
              child.parentVisitId = sibling.id;
              failed = false;
              try {
                await parseBackup(current);
              } catch {
                failed = true;
              }
              if (!failed) throw Error("Current backup allowed nesting");
              const archive = await snapshot();
              const storedChild = archive.visits.find(
                (visit) => visit.id === child.id,
              );
              failed = false;
              try {
                await saveRecord(
                  "visits",
                  { ...storedChild, parentVisitId: sibling.id },
                  storedChild,
                );
              } catch {
                failed = true;
              }
              if (!failed)
                throw Error("Save allowed a follow-up of a follow-up");
            }, fixture);
            const restored = await page.evaluate(async () =>
              (await import("./assets/js/services/backup.js")).createBackup(),
            );
            assert.deepEqual(restored.data, expected);
            console.log(
              `PASS v${oldVersion}→v5 preserves legacy advice in notes, episode links, audit timestamps, courses and attachments; old backup restore and strict new writes`,
            );
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
