// Appointment provider exclusivity, legacy preservation and mobile forms.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
const meta = () => ({ id: randomUUID(), createdAt: "2026-01-01T12:00:00.000Z", updatedAt: "2026-01-02T12:00:00.000Z" });
const data = Object.fromEntries(["visits", "diagnoses", "treatments", "medications", "doctors", "clinics", "documents", "appointments"].map((name) => [name, []]));
const direct = { ...meta(), name: "Synthetic direct clinic" };
const inherited = { ...meta(), name: "Synthetic inherited clinic" };
data.clinics.push(direct, inherited);
for (let i = 0; i < 8; i++) data.clinics.push({ ...meta(), name: `Synthetic clinic ${i}` });
const doctor = { ...meta(), name: "Synthetic doctor", clinicId: inherited.id };
const noClinic = { ...meta(), name: "Synthetic doctor without clinic" };
data.doctors.push(doctor, noClinic);
const visit = { ...meta(), title: "Synthetic completed visit", date: "2026-01-01T10:00", type: "Other", treatmentIds: [] };
data.visits.push(visit);
const appointment = (extra) => ({ ...meta(), reason: "Synthetic historical appointment", date: "2026-01-01T10:00", status: "Completed", visitId: visit.id, ...extra });
data.appointments.push(
  appointment({ doctorId: doctor.id, clinicId: direct.id, notes: "N".repeat(20000) }),
  appointment({ doctorId: noClinic.id, clinicId: direct.id }),
  appointment({ clinicId: direct.id, notes: "Original direct clinic notes" }),
  appointment({ doctorId: doctor.id, notes: "Original doctor notes" }),
  appointment({}),
);
const pdf = "%PDF-1.4\nSynthetic appointment attachment\n%%EOF";
data.documents.push({ ...meta(), name: "synthetic.pdf", visitId: visit.id, issueDate: "2026-01-01", type: "application/pdf", size: pdf.length, base64: Buffer.from(pdf).toString("base64") });
const backup = { format: "medly-backup", schemaVersion: 8, appVersion: "1.7.0", exportedAt: "2026-01-02T12:00:00.000Z", data };
const expected = structuredClone(data);
expected.appointments = expected.appointments.map((record) => record.doctorId && record.clinicId ? {
  ...record, clinicId: "", notes: [record.notes, `Previously assigned clinic: ${direct.name} (${direct.id})`].filter(Boolean).join("\n\n"),
} : record);
for (const records of Object.values(expected)) records.sort((a, b) => a.id.localeCompare(b.id));

(async () => {
  const browser = await chromium.launch({ ...(process.env.MEDLY_BROWSER ? { channel: process.env.MEDLY_BROWSER } : {}), headless: true });
  try {
    for (const fail of [false, true]) {
      const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 320, height: 750 } });
      try {
        const page = await context.newPage();
        await page.route("**/appointment-fixture.html", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic appointment fixture</title>" }));
        await page.goto(`${baseURL}/appointment-fixture.html`);
        await page.evaluate(async (data) => {
          await new Promise((resolve, reject) => {
            const request = indexedDB.open("medly", 8);
            request.onupgradeneeded = () => {
              for (const name of Object.keys(data)) request.result.createObjectStore(name, { keyPath: "id" });
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result, tx = db.transaction(Object.keys(data), "readwrite");
              for (const [name, records] of Object.entries(data)) for (const source of records) {
                const record = { ...source };
                if (name === "documents") { record.blob = new Blob([atob(record.base64)], { type: record.type }); delete record.base64; }
                tx.objectStore(name).put(record);
              }
              tx.oncomplete = () => { db.close(); resolve(); };
              tx.onabort = () => reject(tx.error);
            };
          });
        }, data);
        if (fail) await page.addInitScript(() => {
          const put = IDBObjectStore.prototype.put, counts = new WeakMap();
          IDBObjectStore.prototype.put = function (...args) {
            if (this.name === "appointments" && this.transaction.mode === "versionchange") {
              const count = (counts.get(this.transaction) || 0) + 1;
              counts.set(this.transaction, count);
              if (count === 2) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
            }
            return put.apply(this, args);
          };
        });
        await page.goto(baseURL);
        if (fail) {
          await page.getByRole("heading", { name: "Your archive could not be opened" }).waitFor();
          const stored = await page.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.open("medly");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result, tx = db.transaction("appointments");
              tx.objectStore("appointments").getAll().onsuccess = (e) => { resolve({ version: db.version, appointments: e.target.result }); db.close(); };
            };
          }));
          assert.equal(stored.version, 8);
          assert.deepEqual(stored.appointments, [...data.appointments].sort((a, b) => a.id.localeCompare(b.id)));
          console.log("PASS failed appointment upgrade rolls back all records and schema");
          continue;
        }
        await page.getByRole("heading", { name: "Your health, together." }).waitFor();
        const current = await page.evaluate(async () => (await import("./assets/js/services/backup.js")).createBackup());
        assert.equal(current.schemaVersion, 9);
        assert.deepEqual(current.data, expected);
        await page.evaluate(async (backup) => {
          const { parseBackup, createBackup, importBackup } = await import("./assets/js/services/backup.js");
          const { saveRecord, deleteRecord } = await import("./assets/js/db/repository.js");
          const canonical = (value) => JSON.stringify(value, (_, item) =>
            item && typeof item === "object" && !Array.isArray(item)
              ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
              : item,
          );
          const before = canonical((await createBackup()).data);
          for (let version = 1; version <= 8; version++) {
            const legacy = structuredClone(backup);
            legacy.schemaVersion = version;
            if (version < 8) for (const v of legacy.data.visits) { v.reason = v.title; delete v.title; }
            if (version < 6) for (const d of legacy.data.documents) delete d.issueDate;
            const parsed = await parseBackup(legacy);
            await importBackup(parsed, "replace");
            await importBackup(parsed, "merge");
            if (canonical((await createBackup()).data) !== before) throw Error(`Schema ${version} migration changed archive data`);
          }
          const largest = structuredClone(backup);
          largest.data.clinics[0].name = "C".repeat(20000);
          const converted = await parseBackup(largest);
          if (converted.appointments[0].notes.length <= 40000) throw Error("Maximum-length notes or clinic name truncated");
          const current = await createBackup();
          await importBackup(await parseBackup(current), "replace");
          const invalid = structuredClone(current);
          invalid.data.appointments[0].doctorId = backup.data.doctors[0].id;
          invalid.data.appointments[0].clinicId = backup.data.clinics[0].id;
          let rejected = false;
          try { await parseBackup(invalid); } catch { rejected = true; }
          if (!rejected) throw Error("New backup accepted both providers");
          rejected = false;
          try { await saveRecord("appointments", { reason: "Invalid synthetic appointment", date: "2026-01-01T10:00", status: "Scheduled", doctorId: backup.data.doctors[0].id, clinicId: backup.data.clinics[0].id }); } catch { rejected = true; }
          if (!rejected) throw Error("Normal writes accepted both providers");
          for (const [store, id] of [["doctors", backup.data.doctors[0].id], ["clinics", backup.data.clinics[0].id]]) {
            rejected = false;
            try { await deleteRecord(store, id); } catch { rejected = true; }
            if (!rejected) throw Error("Referenced provider deleted");
          }
          if (canonical((await createBackup()).data) !== before) throw Error("Rejected operations changed data");
        }, backup);
        console.log("PASS populated v8 upgrade, preserved clinic details and maximum-length notes, timestamps, visit links and attachment bytes; schemas 1 through 9 backups and rejected provider conflicts");
        await page.goto(`${baseURL}/#/appointments`);
        await page.locator('[data-add="appointments"]').first().click();
        const doctorSelect = page.locator("#field-doctorId"), clinicSelect = page.locator("#field-clinicId");
        const clinicSearch = page.locator('[data-filter-select="field-clinicId"]');
        assert(await clinicSelect.isVisible());
        assert(await clinicSearch.isVisible());
        await page.locator("#field-reason").fill("Synthetic new appointment");
        await clinicSelect.selectOption(direct.id);
        await doctorSelect.selectOption(doctor.id);
        assert.equal(await clinicSelect.isVisible(), false);
        assert.equal(await clinicSelect.isEnabled(), false);
        assert.equal(await clinicSearch.isVisible(), false);
        await page.getByText(`Clinic: ${inherited.name}`, { exact: true }).waitFor();
        await doctorSelect.selectOption(noClinic.id);
        await page.getByText("No clinic assigned to this doctor.", { exact: true }).waitFor();
        assert.equal(await clinicSelect.isVisible(), false);
        await doctorSelect.selectOption("");
        assert.equal(await clinicSelect.inputValue(), direct.id);
        await doctorSelect.selectOption(doctor.id);
        assert(await page.locator("#modal").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
        const save = async () => { await page.locator('#record-form button[type="submit"]').click(); await page.waitForFunction(() => !document.querySelector("#modal").open); };
        await save();
        await page.getByRole("heading", { name: "Synthetic new appointment", exact: true }).waitFor();
        const id = await page.evaluate(() => location.hash.split("/")[2]);
        await page.locator(`.detail-grid a[href="#/clinics/${inherited.id}"]`).waitFor();
        const checkProvider = async (expected) => page.evaluate(async ({ id, expected }) => {
          const record = (await (await import("./assets/js/db/database.js")).snapshot()).appointments.find((a) => a.id === id);
          if ((record.doctorId || "") !== expected.doctorId || (record.clinicId || "") !== expected.clinicId) throw Error("Wrong stored provider selection");
        }, { id, expected });
        await checkProvider({ doctorId: doctor.id, clinicId: "" });
        await page.goto(`${baseURL}/#/appointments`);
        await page.locator("#list-search").fill(inherited.name);
        await page.locator(`#list-results a[href="#/appointments/${id}"]`).waitFor();
        await page.goto(`${baseURL}/#/appointments/${id}`);
        await page.locator(`[data-edit="${id}"]`).click();
        assert.equal(await clinicSelect.isVisible(), false);
        await doctorSelect.selectOption("");
        await clinicSelect.selectOption(direct.id);
        await save();
        await checkProvider({ doctorId: "", clinicId: direct.id });
        await page.locator(`.detail-grid a[href="#/clinics/${direct.id}"]`).waitFor();
        await page.reload();
        await page.locator(`.detail-grid a[href="#/clinics/${direct.id}"]`).waitFor();
        console.log("PASS 320px appointment form, hidden and disabled clinic/search, inherited-clinic hint, doctor without clinic, switching, persistence, details and inherited-clinic search");
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
