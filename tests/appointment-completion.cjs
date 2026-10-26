// Focused completion UI and atomic status/link updates. Synthetic records only.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
(async () => {
  const browser = await chromium.launch({ ...(process.env.MEDLY_BROWSER ? { channel: process.env.MEDLY_BROWSER } : {}), headless: true });
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 320, height: 750 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL);
    await page.getByRole("heading", { name: "Your health, together." }).waitFor();
    const fixture = await page.evaluate(async () => {
      const { saveRecord } = await import("./assets/js/db/repository.js");
      const clinic = await saveRecord("clinics", { name: "Synthetic clinic" });
      const doctor = await saveRecord("doctors", { name: "Synthetic doctor", clinicId: clinic.id });
      const visits = [];
      for (let i = 1; i <= 10; i++) visits.push(await saveRecord("visits", { title: `Synthetic visit ${i}`, date: `2026-01-${String(i).padStart(2, "0")}T10:00`, type: "Other" }));
      const appointment = await saveRecord("appointments", { reason: "Synthetic appointment <tag>", date: "2026-02-01T10:00", status: "Scheduled", doctorId: doctor.id, notes: "Original synthetic notes", visitId: visits[0].id });
      const linked = await saveRecord("appointments", { reason: "Synthetic linked appointment", date: "2026-02-02T10:00", status: "Scheduled", clinicId: clinic.id });
      return { appointment, linked, visits, clinic };
    });
    const open = async (id) => {
      await page.goto(`${baseURL}/#/appointments/${id}`);
      await page.locator("[data-complete]").click();
      await page.getByRole("heading", { name: "Complete appointment", exact: true }).waitFor();
    };
    const stored = (id) => page.evaluate(async (id) => (await (await import("./assets/js/db/database.js")).snapshot()).appointments.find((a) => a.id === id), id);
    const submit = () => page.locator('#appointment-completion-form button[type="submit"]').click();
    await open(fixture.appointment.id);
    assert.equal(await page.locator("#record-form").count(), 0);
    assert.equal(await page.locator("#field-status, #field-reason, #field-date, #field-doctorId, #field-clinicId, textarea").count(), 0);
    assert.equal(await page.locator("#appointment-completion-form select").count(), 1);
    assert.equal(await page.locator("#field-visitId").inputValue(), fixture.visits[0].id);
    assert.equal(await page.locator("#modal tag").count(), 0);
    await page.getByLabel("Filter medical visits", { exact: true }).fill("Synthetic visit 2");
    assert.equal(await page.locator("#field-visitId option:not([hidden])").count(), 2);
    await page.locator("#field-visitId").selectOption(fixture.visits[1].id);
    await page.mouse.click(2, 2);
    assert(await page.locator("#modal").evaluate((el) => el.open));
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.keyboard.press("Escape");
    assert(await page.locator("#modal").evaluate((el) => el.open));
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#completion-cancel").click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.deepEqual(await stored(fixture.appointment.id), fixture.appointment);
    console.log("PASS focused dialog, optional existing link, searchable visits, escaped text, backdrop and discard guards; cancel writes nothing");
    await open(fixture.appointment.id);
    await page.locator("#field-visitId").selectOption("");
    const concurrent = await page.evaluate(async ({ appointment, clinic }) => (await import("./assets/js/db/repository.js")).saveRecord("appointments", { reason: "Updated while completing", notes: "Latest notes", doctorId: "", clinicId: clinic.id, date: "2026-02-03T11:30" }, appointment), fixture);
    assert(await page.locator("#modal").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    await submit();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    const completed = await stored(fixture.appointment.id);
    const { updatedAt, ...rest } = completed;
    const { updatedAt: previousUpdate, ...expected } = concurrent;
    assert.deepEqual(rest, { ...expected, status: "Completed", visitId: "" });
    console.log("PASS automatic Completed status, unlinked completion and preservation of latest appointment details");
    await open(fixture.linked.id);
    await page.locator("#field-visitId").selectOption(fixture.visits[9].id);
    await page.evaluate(async (id) => (await import("./assets/js/db/repository.js")).deleteRecord("visits", id), fixture.visits[9].id);
    await submit();
    await page.getByText("This medical visit no longer exists. Choose another visit or leave it unlinked.", { exact: true }).waitFor();
    assert.deepEqual(await stored(fixture.linked.id), fixture.linked);
    await page.locator("#field-visitId").selectOption(fixture.visits[1].id);
    await page.evaluate(() => {
      window.__completionPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "appointments") throw new DOMException("Synthetic quota failure", "QuotaExceededError");
        return window.__completionPut.apply(this, args);
      };
    });
    await submit();
    await page.getByText("Storage is full. Export a backup and free space before retrying.", { exact: true }).waitFor();
    assert.deepEqual(await stored(fixture.linked.id), fixture.linked);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.__completionPut; delete window.__completionPut; });
    await submit();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    const linked = await stored(fixture.linked.id);
    assert.equal(linked.status, "Completed");
    assert.equal(linked.visitId, fixture.visits[1].id);
    await page.locator(`.detail-grid a[href="#/visits/${fixture.visits[1].id}"]`).waitFor();
    console.log("PASS missing-visit and failed-write protection, inline errors, retry and linked completion");
    await page.evaluate(async () => {
      const { saveRecord, completeAppointment, deleteRecord } = await import("./assets/js/db/repository.js");
      const { snapshot } = await import("./assets/js/db/database.js");
      const cancelled = await saveRecord("appointments", { reason: "Synthetic cancelled appointment", date: "2026-02-01T10:00", status: "Cancelled" });
      let rejected = false;
      try { await completeAppointment(cancelled.id); } catch { rejected = true; }
      if (!rejected) throw Error("Cancelled appointment completed");
      const pending = await saveRecord("appointments", { reason: "Synthetic rollback appointment", date: "2026-02-01T10:00", status: "Scheduled" });
      const before = JSON.stringify(await snapshot());
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        if (this.name === "appointments") request.addEventListener("success", () => this.transaction.abort(), { once: true });
        return request;
      };
      rejected = false;
      try { await completeAppointment(pending.id); } catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = put; }
      if (!rejected || JSON.stringify(await snapshot()) !== before) throw Error("Completion reported success before commit or failed to roll back");
      await deleteRecord("appointments", pending.id);
      rejected = false;
      try { await completeAppointment(pending.id); } catch { rejected = true; }
      if (!rejected) throw Error("Deleted appointment recreated");
    });
    assert.deepEqual(errors, []);
    console.log("PASS stale status and deleted appointment rejection; aborted transaction rolls back and never reports success");
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
