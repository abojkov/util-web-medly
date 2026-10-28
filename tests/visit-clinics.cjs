// Direct clinic visits and additive schema upgrade. Synthetic records only.
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
    "diagnoses",
    "treatments",
    "medications",
    "doctors",
    "clinics",
    "documents",
    "appointments",
  ].map((name) => [name, []]),
);
const clinic = { ...meta(), name: "Synthetic laboratory" };
const practice = { ...meta(), name: "Synthetic doctor clinic" };
const doctor = { ...meta(), name: "Synthetic doctor", clinicId: practice.id };
const oldVisit = {
  ...meta(),
  reason: "Existing doctor visit",
  date: "2018-02-03T10:00",
  type: "Other",
  doctorId: doctor.id,
};
data.clinics.push(clinic, practice);
data.doctors.push(doctor);
data.visits.push(oldVisit);
const backup = {
  format: "medly-backup",
  schemaVersion: 6,
  appVersion: "1.5.2",
  exportedAt: "2026-01-01T12:00:00.000Z",
  data,
};
(async () => {
  const browser = await chromium.launch({
    ...(process.env.MEDLY_BROWSER
      ? { channel: process.env.MEDLY_BROWSER }
      : {}),
    headless: true,
  });
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 320, height: 750 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const save = async () => {
      await page.locator('#record-form button[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector("#modal").open);
    };
    await page.route("**/clinic-fixture.html", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Synthetic fixture</title>",
      }),
    );
    await page.goto(`${baseURL}/clinic-fixture.html`);
    await page.evaluate(async (data) => {
      await new Promise((resolve, reject) => {
        const r = indexedDB.open("medly", 6);
        r.onupgradeneeded = () => {
          for (const name of Object.keys(data))
            r.result.createObjectStore(name, { keyPath: "id" });
        };
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction(Object.keys(data), "readwrite");
          for (const [name, records] of Object.entries(data))
            for (const record of records) tx.objectStore(name).put(record);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      });
    }, data);
    await page.goto(baseURL);
    await page
      .getByRole("heading", { name: "Your health, together." })
      .waitFor();
    const upgraded = await page.evaluate(async () => {
      const { openDatabase } = await import("./assets/js/db/database.js");
      const db = await openDatabase();
      return {
        backup: await (
          await import("./assets/js/services/backup.js")
        ).createBackup(),
        hasIndex: db
          .transaction("visits")
          .objectStore("visits")
          .indexNames.contains("clinicId"),
      };
    });
    assert.equal(upgraded.backup.schemaVersion, 9);
    assert(upgraded.hasIndex);
    for (const name of Object.keys(data))
      assert.deepEqual(
        upgraded.backup.data[name],
        data[name].map((record) => {
          if (name !== "visits") return record;
          const { reason, ...visit } = record;
          return { ...visit, title: reason };
        }).sort((a, b) => a.id.localeCompare(b.id)),
      );
    await page.evaluate(async (backup) => {
      const { parseBackup } = await import("./assets/js/services/backup.js");
      const parsed = await parseBackup(backup);
      if (parsed.visits.some((v) => "clinicId" in v))
        throw Error("Legacy backup invented clinic links");
    }, backup);
    await page.goto(`${baseURL}/#/visits`);
    await page.locator('[data-add="visits"]').first().click();
    assert(await page.locator("#field-clinicId").isVisible());
    await page.locator("#field-title").fill("Synthetic blood test");
    await page.locator("#field-date").fill("2018-03-01T10:00");
    await page.locator("#field-type").selectOption("Laboratory visit");
    await page.locator("#field-clinicId").selectOption(clinic.id);
    assert(
      await page
        .locator("#modal")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await save();
    await page
      .getByRole("heading", { name: "Synthetic blood test", exact: true })
      .waitFor();
    const visitId = await page.evaluate(() => location.hash.split("/")[2]);
    await page
      .locator(`.detail-grid a[href="#/clinics/${clinic.id}"]`)
      .waitFor();
    await page.goto(`${baseURL}/#/clinics/${clinic.id}`);
    await page.locator(`a[href="#/visits/${visitId}"]`).waitFor();
    await page.goto(`${baseURL}/#/visits`);
    await page.locator(".visit-search > summary").click();
    await page.locator("#list-search").fill(clinic.name);
    await page.locator(`#list-results a[href="#/visits/${visitId}"]`).waitFor();
    await page.goto(`${baseURL}/#/visits/${visitId}`);
    await page.locator('[data-edit][data-store="visits"]').click();
    assert.equal(await page.locator("#field-clinicId").inputValue(), clinic.id);
    await page.locator("#field-doctorId").selectOption(doctor.id);
    assert.equal(await page.locator("#field-clinicId").isVisible(), false);
    await page.locator("#field-doctorId").selectOption("");
    assert.equal(await page.locator("#field-clinicId").inputValue(), clinic.id);
    await page.locator("#field-doctorId").selectOption(doctor.id);
    await save();
    await page
      .locator(`.detail-grid a[href="#/clinics/${practice.id}"]`)
      .waitFor();
    await page.evaluate(async (id) => {
      const v = (
        await (await import("./assets/js/db/database.js")).snapshot()
      ).visits.find((v) => v.id === id);
      if (v.clinicId || !v.doctorId)
        throw Error("Doctor selection retained direct clinic");
    }, visitId);
    await page.locator('[data-edit][data-store="visits"]').click();
    await page.locator("#field-doctorId").selectOption("");
    await page.locator("#field-clinicId").selectOption(clinic.id);
    await save();
    await page.locator("[data-followup]").click();
    assert.equal(await page.locator("#field-doctorId").inputValue(), "");
    assert.equal(await page.locator("#field-clinicId").inputValue(), clinic.id);
    await save();
    await page
      .getByRole("heading", {
        name: "Follow-up: Synthetic blood test",
        exact: true,
      })
      .waitFor();
    await page.evaluate(
      async ({ clinic, doctor }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord, deleteRecord } = await import(
          "./assets/js/db/repository.js"
        );
        const before = await snapshot();
        for (const values of [
          { doctorId: doctor.id, clinicId: clinic.id },
          { clinicId: crypto.randomUUID() },
        ]) {
          let rejected = false;
          try {
            await saveRecord("visits", {
              title: "Invalid clinic visit",
              date: "2018-03-01T10:00",
              type: "Other",
              ...values,
            });
          } catch {
            rejected = true;
          }
          if (!rejected) throw Error("Invalid clinic relationship accepted");
        }
        let rejected = false;
        try {
          await deleteRecord("clinics", clinic.id);
        } catch {
          rejected = true;
        }
        if (!rejected) throw Error("Referenced clinic deleted");
        if (JSON.stringify(await snapshot()) !== JSON.stringify(before))
          throw Error("Failed operation changed records");
        const { createBackup, parseBackup, importBackup } = await import(
          "./assets/js/services/backup.js"
        );
        const backup = await createBackup();
        await importBackup(await parseBackup(backup));
        if (
          JSON.stringify((await createBackup()).data) !==
          JSON.stringify(backup.data)
        )
          throw Error("Clinic links lost in backup round trip");
      },
      { clinic, doctor },
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS additive v6→v9 upgrade preserves records; legacy/current backups, clinic-only mobile visits, doctor switching, clinic search/history, follow-up defaults and transactional relationship protection",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
