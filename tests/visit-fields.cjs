// Visit field renames, backup compatibility and atomic upgrades. Synthetic data only.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
const meta = () => ({
  id: randomUUID(),
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-02-01T12:00:00.000Z",
});
const data = Object.fromEntries([
  "visits", "diagnoses", "treatments", "medications", "doctors", "clinics",
  "documents", "appointments",
].map((name) => [name, []]));
const root = {
  ...meta(), reason: "Synthetic historical title <tag>",
  symptoms: "Original reason & symptoms\n" + "S".repeat(19970),
  date: "2020-02-03T10:00", type: "Other", notes: "Original notes",
};
const child = {
  ...meta(), reason: "Synthetic follow-up", symptoms: "Original follow-up symptoms",
  date: "2020-02-04T10:00", type: "Follow-up", parentVisitId: root.id,
};
const unknown = {
  ...meta(), reason: "Unknown symptoms", date: "2020-02-05T10:00", type: "Other",
};
const course = { ...meta(), name: "Synthetic care", status: "Completed", startDate: "2020-02-03", endDate: "2020-02-04" };
root.treatmentIds = [course.id];
data.visits.push(root, child, unknown);
data.treatments.push(course);
data.appointments.push({ ...meta(), reason: "Synthetic appointment reason", date: "2020-02-03T10:00", status: "Completed", visitId: root.id });
const pdf = "%PDF-1.4\nSynthetic attachment\n%%EOF";
data.documents.push({ ...meta(), name: "synthetic.pdf", visitId: root.id, issueDate: "2020-02-03", type: "application/pdf", size: pdf.length, base64: Buffer.from(pdf).toString("base64") });
const backup = { format: "medly-backup", schemaVersion: 7, appVersion: "1.6.0", exportedAt: "2026-02-01T12:00:00.000Z", data };
const expected = structuredClone(data);
expected.visits = expected.visits.map(({reason, symptoms, ...record}) => ({ ...record, title: reason, ...(symptoms !== undefined ? {reasonAndSymptoms: symptoms} : {}) }));
for (const records of Object.values(expected)) records.sort((a,b) => a.id.localeCompare(b.id));

(async () => {
  const browser = await chromium.launch({ ...(process.env.MEDLY_BROWSER ? { channel: process.env.MEDLY_BROWSER } : {}), headless: true });
  try {
    for (const fail of [false, true]) {
      const context = await browser.newContext({ serviceWorkers: "block", viewport: {width: 320, height: 750} });
      try {
        const page = await context.newPage();
        await page.route("**/visit-fields-fixture.html", (route) => route.fulfill({contentType:"text/html", body:"<!doctype html><title>Synthetic fixture</title>"}));
        await page.goto(`${baseURL}/visit-fields-fixture.html`);
        await page.evaluate(async (data) => {
          await new Promise((resolve,reject) => {
            const request = indexedDB.open("medly", 7);
            request.onupgradeneeded = () => {
              for (const name of Object.keys(data)) request.result.createObjectStore(name, {keyPath:"id"});
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result, tx = db.transaction(Object.keys(data), "readwrite");
              for (const [name, records] of Object.entries(data)) for (const source of records) {
                const record = {...source};
                if (name === "documents") { record.blob = new Blob([atob(record.base64)], {type:record.type}); delete record.base64; }
                tx.objectStore(name).put(record);
              }
              tx.oncomplete = () => {db.close();resolve();};
              tx.onabort = () => reject(tx.error);
            };
          });
        }, data);
        if (fail) await page.addInitScript(() => {
          const put = IDBObjectStore.prototype.put;
          const counts = new WeakMap();
          IDBObjectStore.prototype.put = function(...args) {
            if (this.name === "visits" && this.transaction.mode === "versionchange") {
              const count = (counts.get(this.transaction) || 0) + 1;
              counts.set(this.transaction, count);
              if (count === 2)
                throw new DOMException("Synthetic quota failure", "QuotaExceededError");
            }
            return put.apply(this,args);
          };
        });
        await page.goto(baseURL);
        if (fail) {
          await page.getByRole("heading", {name:"Your archive could not be opened"}).waitFor();
          const stored = await page.evaluate(() => new Promise((resolve,reject) => {
            const request = indexedDB.open("medly");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result, tx = db.transaction("visits");
              tx.objectStore("visits").getAll().onsuccess = (event) => {resolve({version:db.version, visits:event.target.result});db.close();};
            };
          }));
          assert.equal(stored.version,7);
          assert.deepEqual(stored.visits,[...data.visits].sort((a,b)=>a.id.localeCompare(b.id)));
          console.log("PASS failed v7 to v8 rename rolls back schema and all visit writes");
          continue;
        }
        await page.getByRole("heading", {name:"Your health, together."}).waitFor();
        const exported = await page.evaluate(async () => (await import("./assets/js/services/backup.js")).createBackup());
        assert.equal(exported.schemaVersion,8);
        assert.deepEqual(exported.data,expected);
        await page.evaluate(async (backup) => {
          const {parseBackup,importBackup,createBackup} = await import("./assets/js/services/backup.js");
          const {snapshot} = await import("./assets/js/db/database.js");
          const {saveRecord} = await import("./assets/js/db/repository.js");
          const current = await createBackup();
          const before = JSON.stringify(current.data);
          for (const mode of ["replace", "merge", "merge"]) {
            await importBackup(await parseBackup(backup), mode);
            if (JSON.stringify((await createBackup()).data) !== before) throw Error("Legacy restore changed data");
          }
          await importBackup(await parseBackup(current), "replace");
          if (JSON.stringify((await createBackup()).data) !== before) throw Error("Current restore changed data");
          for (const version of [7,8]) {
            const invalid = structuredClone(version === 7 ? backup : current);
            const record = invalid.data.visits[0];
            record[version === 7 ? "symptoms" : "reasonAndSymptoms"] = 42;
            let failed = false;
            try {await parseBackup(invalid);} catch {failed=true;}
            if (!failed) throw Error("Invalid clinical text accepted");
          }
          const mixed = structuredClone(current);
          mixed.data.visits[0].symptoms = "Old field";
          let failed = false;
          try {await parseBackup(mixed);} catch {failed=true;}
          if (!failed) throw Error("Mixed field names accepted");
          const visit = (await snapshot()).visits[0];
          failed = false;
          try {await saveRecord("visits", {reason:"Old field"}, visit);} catch {failed=true;}
          if (!failed) throw Error("Obsolete fields accepted by normal writes");
          if (JSON.stringify((await createBackup()).data) !== before) throw Error("Rejected writes changed data");
        }, backup);
        console.log("PASS field text, missing optional values, IDs, timestamps, links, appointment reasons and attachment bytes preserved; v7/v8 backup round trips and invalid fields rejected");
        await page.goto(`${baseURL}/#/visits/${root.id}`);
        await page.getByRole("heading", {name:root.reason, exact:true}).waitFor();
        await page.getByText("Visit title", {exact:true}).waitFor();
        await page.getByText("Visit reason & symptoms", {exact:true}).first().waitFor();
        assert.equal(await page.locator(".followup-facts dt").getByText("Visit reason & symptoms",{exact:true}).count(),1);
        await page.locator(`[data-edit="${root.id}"]`).click();
        assert.equal(await page.getByLabel(/^Visit title/).inputValue(), root.reason);
        assert.equal(await page.getByLabel("Visit reason & symptoms", {exact:true}).inputValue(), root.symptoms);
        await page.getByLabel(/^Visit title/).fill("Edited synthetic visit");
        await page.getByLabel("Visit reason & symptoms", {exact:true}).fill("Updated visit reason and symptoms");
        await page.locator('#record-form button[type="submit"]').click();
        await page.getByRole("heading",{name:"Edited synthetic visit",exact:true}).waitFor();
        await page.reload();
        await page.getByText("Updated visit reason and symptoms",{exact:true}).waitFor();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.goto(`${baseURL}/#/visits`);
        await page.locator(".visit-search > summary").click();
        await page.locator("#list-search").fill("Updated visit reason");
        await page.locator(`#list-results a[href="#/visits/${root.id}"]`).waitFor();
        console.log("PASS new form/detail/follow-up labels, escaped title, editing, persistence, renamed-field search and 320px layout");
      } finally {await context.close();}
    }
  } finally {await browser.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
