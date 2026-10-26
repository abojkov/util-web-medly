// Development-only integration tests. Uses an isolated synthetic archive.
const assert = require("node:assert/strict");
const { mkdtemp } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";

(async () => {
  const artifacts = await mkdtemp(path.join(os.tmpdir(), "medly-browser-"));
  const browser = await chromium.launch({
    ...(process.env.MEDLY_BROWSER
      ? { channel: process.env.MEDLY_BROWSER }
      : {}),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(baseURL);
    await page
      .getByRole("heading", { name: "Your health, together." })
      .waitFor();
    assert.equal(await page.locator(".stat-number").first().textContent(), "0");
    await page.screenshot({
      path: path.join(artifacts, "desktop-empty.png"),
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overview overflows at ${width}px`,
      );
      if (width === 390)
        await page.screenshot({
          path: path.join(artifacts, "mobile-empty.png"),
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Actual form flow: clinic → doctor → diagnosis/treatment/medication → linked visit.
    const add = async (store, fields, selects = {}) => {
      await page.goto(`${baseURL}/#/${store}`);
      await page.locator(`[data-add="${store}"]`).first().click();
      for (const [key, value] of Object.entries(fields))
        await page.locator(`#field-${key}`).fill(value);
      for (const [key, value] of Object.entries(selects))
        await page.locator(`#field-${key}`).selectOption(value);
      await page.locator('#record-form button[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector("#modal").open);
      await page.waitForFunction(
        (store) => location.hash.startsWith(`#/${store}/`),
        store,
      );
      return (await page.evaluate(() => location.hash)).split("/")[2];
    };
    const clinicId = await add("clinics", {
      name: "Synthetic Care Clinic",
      address: "Test address",
    });
    const doctorId = await add(
      "doctors",
      { name: "Dr. Synthetic Example", specialty: "Test specialty" },
      { clinicId },
    );
    const diagnosisId = await add("diagnoses", {
      name: "Synthetic diagnosis",
      date: "2026-01-10",
    });
    const treatmentId = await add(
      "treatments",
      {
        name: "Synthetic care plan",
        startDate: "2026-01-10",
        endDate: "2027-01-10",
      },
    );
    const medicationId = await add("medications", {
      name: "Synthetic medication",
      strength: "Test strength",
      form: "Test form",
    });
    const medicationCourseId = await add(
      "treatments",
      {
        name: "Synthetic medication",
        dosage: "Test dose",
        frequency: "Test frequency",
        startDate: "2026-01-10",
      },
      { medicationId, doctorId },
    );
    const visitId = await add(
      "visits",
      {
        title: "Synthetic visit",
        date: "2026-01-10T10:30",
        reasonAndSymptoms: "Synthetic symptoms",
        findings: "Synthetic finding",
        procedures: "ECG, blood sample",
        notes: '<img src=x onerror="window.__unsafe=true">',
      },
      {
        doctorId,
      },
    );
    await page
      .getByRole("heading", { name: "Synthetic visit", exact: true })
      .waitFor();
    // Existing archives retain their linked treatments after clinical edits.
    await page.evaluate(
      async ({ visitId, diagnosisId, treatmentId, medicationCourseId }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord } = await import("./assets/js/db/repository.js");
        const visit = (await snapshot()).visits.find((v) => v.id === visitId);
        await saveRecord(
          "visits",
          {
            diagnosisIds: [diagnosisId],
            treatmentIds: [treatmentId, medicationCourseId],
          },
          visit,
        );
      },
      { visitId, diagnosisId, treatmentId, medicationCourseId },
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "Synthetic visit", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("main")
        .getByText("Synthetic diagnosis", { exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator("main")
        .getByText("Synthetic care plan", { exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator("main")
        .getByText("Synthetic medication", { exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator("main")
        .getByText("Synthetic Care Clinic", { exact: true })
        .count(),
      1,
    );
    assert.equal(await page.evaluate(() => window.__unsafe), undefined);
    await page.reload();
    await page
      .getByRole("heading", { name: "Synthetic visit", exact: true })
      .waitFor();
    await page.locator("[data-edit]").click();
    await page.locator("#field-notes").fill("Edited synthetic note");
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.getByText("Edited synthetic note", { exact: true }).waitFor();

    // Discard guard, inline validation and static backdrop.
    await page.locator("[data-edit]").click();
    await page.locator("#field-title").fill("Unsaved synthetic edit");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#form-cancel").click();
    assert(await page.locator("#modal").evaluate((dialog) => dialog.open));
    await page.mouse.click(2, 2);
    assert(await page.locator("#modal").evaluate((dialog) => dialog.open));
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-close]").click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);

    // File upload and original download.
    await page.locator('[data-add="documents"]').click();
    const fileBytes = Buffer.from(
      "%PDF-1.4\n% Synthetic test attachment\n%%EOF",
    );
    await page.locator("#document-file").setInputFiles({
      name: "synthetic-report.pdf",
      mimeType: "application/pdf",
      buffer: fileBytes,
    });
    await page.locator("#field-description").fill("Synthetic report");
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.getByRole("heading", { name: "synthetic-report.pdf" }).waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-download]").click();
    const downloaded = await downloadPromise;
    assert.equal(downloaded.suggestedFilename(), "synthetic-report.pdf");
    await page.locator("[data-preview]").click();
    assert.equal(await page.locator("#document-preview iframe").count(), 1);

    const appointmentId = await add(
      "appointments",
      { reason: "Synthetic appointment", date: "2026-01-10T09:15" },
      { clinicId, doctorId },
    );
    await page.locator("[data-complete]").click();
    await page.locator("#field-visitId").selectOption(visitId);
    await page.locator('#appointment-completion-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page
      .locator("main")
      .getByText("Completed", { exact: true })
      .waitFor();

    // Deletion protection in the real database, transaction rollback, backup round trips.
    const checks = await page.evaluate(
      async ({ doctorId, visitId, appointmentId }) => {
        const { snapshot, transaction, clearDatabase } = await import(
          "./assets/js/db/database.js"
        );
        const { deleteRecord, saveRecord } = await import(
          "./assets/js/db/repository.js"
        );
        const { createBackup, parseBackup, importBackup } = await import(
          "./assets/js/services/backup.js"
        );
        const { validateFile } = await import(
          "./assets/js/utils/validation.js"
        );
        const { searchRecords } = await import(
          "./assets/js/services/history.js"
        );
        const checks = [];
        const ensure = (condition, name) => {
          if (!condition) throw Error(name);
          checks.push(name);
        };
        const before = await snapshot();
        let blocked = false;
        try {
          await deleteRecord("doctors", doctorId);
        } catch {
          blocked = true;
        }
        ensure(
          blocked && (await snapshot()).doctors.length === 1,
          "referenced doctor deletion blocked",
        );
        blocked = false;
        try {
          await deleteRecord("visits", visitId);
        } catch {
          blocked = true;
        }
        ensure(
          blocked && (await snapshot()).visits.length === 1,
          "visit attachments and appointments protected",
        );
        ensure(
          searchRecords(before, "ECG", "visits").length === 1,
          "procedure partial search",
        );
        ensure(
          searchRecords(before, "SYNTHETIC CARE CLIN", "visits").length === 1,
          "case-insensitive linked clinic search",
        );
        const backup = await createBackup();
        ensure(
          backup.data.documents[0].base64 && !backup.data.documents[0].blob,
          "backup attachment encoding",
        );
        const encoded = JSON.stringify(backup);
        const parsed = await parseBackup(encoded);
        ensure(
          (await parsed.documents[0].blob.text()) ===
            "%PDF-1.4\n% Synthetic test attachment\n%%EOF",
          "attachment bytes round trip",
        );
        await importBackup(parsed, "merge");
        ensure(
          (await snapshot()).visits.length === 1,
          "merge avoids duplicate IDs",
        );
        const newer = {
          ...before.visits[0],
          notes: "A newer local edit",
          updatedAt: "2099-01-01T00:00:00.000Z",
        };
        await transaction(["visits"], "readwrite", (tx) =>
          tx.objectStore("visits").put(newer),
        );
        await importBackup(parsed, "merge");
        ensure(
          (await snapshot()).visits[0].notes === "A newer local edit",
          "merge preserves newer local edit",
        );
        const invalid = JSON.parse(encoded);
        invalid.data.visits[0].doctorId = crypto.randomUUID();
        blocked = false;
        try {
          await parseBackup(invalid);
        } catch {
          blocked = true;
        }
        ensure(
          blocked &&
            (await snapshot()).visits[0].notes === "A newer local edit",
          "dangling backup rejected without writes",
        );
        const corrupt = JSON.parse(encoded);
        corrupt.data.documents[0].base64 = "garbage!";
        blocked = false;
        try {
          await parseBackup(corrupt);
        } catch {
          blocked = true;
        }
        ensure(blocked, "corrupted attachment rejected");
        const maximum = JSON.parse(encoded);
        maximum.data.documents[0].size = 7 * 1024 * 1024;
        maximum.data.documents[0].base64 = btoa(
          "%PDF-" + " ".repeat(7 * 1024 * 1024 - 5),
        );
        ensure(
          (await parseBackup(maximum)).documents[0].blob.size ===
            7 * 1024 * 1024,
          "maximum 7 MiB attachment restores safely",
        );
        for (const alter of [
          (backup) => {
            backup.schemaVersion = 99;
          },
          (backup) => {
            backup.data.visits[0].date = "2026-02-31T10:30";
          },
          (backup) => {
            delete backup.data.appointments[0].status;
          },
        ]) {
          const invalid = JSON.parse(encoded);
          alter(invalid);
          blocked = false;
          try {
            await parseBackup(invalid);
          } catch {
            blocked = true;
          }
          ensure(
            blocked,
            "unsupported schema, impossible date or missing status rejected",
          );
        }
        const duplicate = JSON.parse(encoded);
        duplicate.data.doctors.push(duplicate.data.doctors[0]);
        blocked = false;
        try {
          await parseBackup(duplicate);
        } catch {
          blocked = true;
        }
        ensure(blocked, "duplicate backup IDs rejected");
        for (const file of [
          new Blob(["invalid"], { type: "application/pdf" }),
          new Blob([new Uint8Array(7 * 1024 * 1024 + 1)], {
            type: "image/png",
          }),
          new Blob(["<svg/>"], { type: "image/svg+xml" }),
        ]) {
          blocked = false;
          try {
            await validateFile(file);
          } catch {
            blocked = true;
          }
          ensure(blocked, "invalid file type, signature or size rejected");
        }
        // Inject failure late in replacement: earlier store clears/writes must roll back.
        const originalPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "documents")
            throw new DOMException(
              "Synthetic quota failure",
              "QuotaExceededError",
            );
          return originalPut.apply(this, args);
        };
        blocked = false;
        try {
          await importBackup(parsed, "replace");
        } catch {
          blocked = true;
        } finally {
          IDBObjectStore.prototype.put = originalPut;
        }
        const rolledBack = await snapshot();
        ensure(
          blocked &&
            rolledBack.visits[0].notes === "A newer local edit" &&
            rolledBack.documents.length === 1 &&
            rolledBack.appointments[0].id === appointmentId,
          "failed replacement rolls back all stores",
        );
        await clearDatabase();
        ensure(
          Object.values(await snapshot()).every((records) => !records.length),
          "atomic clear removes all records",
        );
        await importBackup(parsed, "replace");
        ensure(
          JSON.stringify(await createBackup(), (key, value) =>
            key === "exportedAt" ? undefined : value,
          ) ===
            JSON.stringify(backup, (key, value) =>
              key === "exportedAt" ? undefined : value,
            ),
          "full export → clear → restore round trip",
        );
        const temporary = await saveRecord("diagnoses", {
          name: "Temporary synthetic record",
          date: "2026-01-01",
          status: "Active",
        });
        await deleteRecord("diagnoses", temporary.id);
        ensure(
          (await snapshot()).diagnoses.length === 1,
          "unreferenced record deletion succeeds",
        );
        return checks;
      },
      { doctorId, visitId, appointmentId },
    );
    checks.forEach((check) => console.log(`PASS ${check}`));

    await page.goto(`${baseURL}/#/visits`);
    const searchPanel = page.locator(".visit-search");
    const searchToggle = searchPanel.locator("summary");
    assert.equal(await searchPanel.getAttribute("open"), null);
    assert.equal(await page.locator("#list-search").isVisible(), false);
    await searchToggle.focus();
    await page.keyboard.press("Enter");
    await page.locator("#list-search").fill("ECG");
    await page.getByText("1 episode", { exact: true }).waitFor();
    await page.locator("#visit-search-count").getByText("1 active", { exact: true }).waitFor();
    await searchToggle.click();
    assert.equal(await page.locator("#list-search").isVisible(), false);
    assert.equal(await page.locator("#list-search").inputValue(), "ECG");
    assert(await page.locator("#visit-search-count").isVisible());
    await searchToggle.focus();
    await page.keyboard.press("Space");
    await page.locator("#filter-from").fill("2027-01-01");
    await page.locator("#visit-search-count").getByText("2 active", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "No matching records" }).waitFor();
    await page.goto(`${baseURL}/#/search`);
    await page.locator("#global-search").fill("edited synthetic note");
    await page
      .locator(`#search-results a[href="#/visits/${visitId}"]`)
      .waitFor();

    // Every section at 320px, including visit detail and a full form.
    await page.setViewportSize({ width: 320, height: 750 });
    for (const section of [
      "dashboard",
      "visits",
      "diagnoses",
      "treatments",
      "medications",
      "doctors",
      "clinics",
      "documents",
      "appointments",
      "timeline",
      "settings",
      `visits/${visitId}`,
    ]) {
      await page.goto(`${baseURL}/#/${section}`);
      await page.waitForTimeout(100);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${section} overflows at 320px`,
      );
    }
    await page.locator("[data-edit]").click();
    assert(
      await page
        .locator("#modal")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Form overflows on mobile",
    );
    await page.locator("[data-close]").click();
    await page.goto(`${baseURL}/#/dashboard`);
    await page.screenshot({
      path: path.join(artifacts, "mobile-populated.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: path.join(artifacts, "desktop-populated.png"),
      fullPage: true,
    });

    // Settings export and destructive dialog cancellation through the UI.
    await page.goto(`${baseURL}/#/settings`);
    const backupDownload = page.waitForEvent("download");
    await page.locator("#export-backup").click();
    const backupFile = await backupDownload;
    assert(backupFile.suggestedFilename().startsWith("medly-backup-"));
    const backupPath = path.join(artifacts, "synthetic-backup.json");
    await backupFile.saveAs(backupPath);
    await page.locator("#import-file").setInputFiles(backupPath);
    await page.locator("#import-backup").click();
    await page.getByRole("heading", { name: "Merge this backup?" }).waitFor();
    await page.locator("#confirm-action").click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page
      .getByText("Your backup was restored successfully.", { exact: true })
      .waitFor();
    await page.locator("#clear-data").click();
    await page.locator("#confirm-cancel").click();
    assert.equal(
      await page.evaluate(
        async () =>
          (await (await import("./assets/js/db/database.js")).snapshot()).visits
            .length,
      ),
      1,
    );

    // Offline reload must load the complete shell and existing IndexedDB records.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.getByRole("heading", { name: "Settings & backups" }).waitFor();
    await context.setOffline(true);
    await page.goto(`${baseURL}/#/visits/${visitId}`);
    await page.reload();
    await page
      .getByRole("heading", { name: "Synthetic visit", exact: true })
      .waitFor();
    await context.setOffline(false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS UI CRUD, persistence, escaped text, discard guards, uploads, downloads, search, filters, mobile layout, offline reload",
    );
    console.log(`Screenshots: ${artifacts}`);
  } catch (error) {
    await page
      .screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error(`Failure screenshot: ${artifacts}/failure.png`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
