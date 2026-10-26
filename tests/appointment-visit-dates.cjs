// Appointment visit choices use local calendar dates and preserve historical links.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
(async () => {
  const browser = await chromium.launch({ ...(process.env.MEDLY_BROWSER ? { channel: process.env.MEDLY_BROWSER } : {}), headless: true });
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 320, height: 750 }, timezoneId: "America/Los_Angeles" });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.getByRole("heading", { name: "Your health, together." }).waitFor();
    const fixture = await page.evaluate(async () => {
      const { saveRecord } = await import("./assets/js/db/repository.js");
      const visits = [];
      for (const [title, date] of [["Synthetic early visit", "2026-03-01T00:05"], ["Synthetic late visit", "2026-03-01T23:55"], ["Synthetic next-day visit", "2026-03-02T12:00"]])
        visits.push(await saveRecord("visits", { title, date, type: "Other" }));
      const appointment = await saveRecord("appointments", { reason: "Synthetic dated appointment", date: "2026-03-01T19:00", status: "Scheduled", visitId: visits[0].id });
      const legacy = await saveRecord("appointments", { reason: "Synthetic historical link", date: "2026-03-03T19:00", status: "Scheduled", visitId: visits[0].id });
      return { visits, appointment, legacy };
    });
    const open = async (record, action) => {
      await page.goto(`${baseURL}/#/appointments/${record.id}`);
      await page.locator(action === "complete" ? "[data-complete]" : `[data-edit="${record.id}"]`).click();
    };
    const choices = () => page.locator("#field-visitId option").evaluateAll((options) => options.map((o) => o.value).filter((id) => id && !id.startsWith("__")).sort());
    const save = () => page.locator('#record-form button[type="submit"]').click();
    const stored = (id) => page.evaluate(async (id) => (await (await import("./assets/js/db/database.js")).snapshot()).appointments.find((a) => a.id === id), id);
    await open(fixture.appointment, "edit");
    assert.deepEqual(await choices(), fixture.visits.slice(0, 2).map((v) => v.id).sort());
    await page.locator("#field-date").fill("2026-03-02T08:00");
    assert.deepEqual(await choices(), [fixture.visits[2].id]);
    assert.equal(await page.locator("#field-visitId").inputValue(), "__keep__");
    await page.locator("#field-visitId").selectOption(fixture.visits[2].id);
    await page.locator("#field-date").fill("2026-03-04T08:00");
    assert.deepEqual(await choices(), []);
    await page.getByText("No medical visits on this date. You can leave this appointment unlinked.", { exact: true }).waitFor();
    await page.locator("#field-date").fill("2026-03-02T23:59");
    await page.locator("#field-visitId").selectOption(fixture.visits[2].id);
    await save();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal((await stored(fixture.appointment.id)).visitId, fixture.visits[2].id);
    await open(fixture.appointment, "complete");
    assert.deepEqual(await choices(), [fixture.visits[2].id]);
    assert.equal(await page.locator("#field-visitId").inputValue(), fixture.visits[2].id);
    assert(await page.locator("#modal").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    await page.locator('#appointment-completion-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal((await stored(fixture.appointment.id)).status, "Completed");
    await open(fixture.legacy, "edit");
    assert.deepEqual(await choices(), []);
    assert.equal(await page.locator("#field-visitId").inputValue(), "__keep__");
    await page.locator("#field-notes").fill("Unrelated clinical note");
    await save();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal((await stored(fixture.legacy.id)).visitId, fixture.visits[0].id);
    await open(fixture.legacy, "complete");
    assert.deepEqual(await choices(), []);
    assert.equal(await page.locator("#field-visitId").inputValue(), "__keep__");
    await page.locator("#field-visitId").selectOption("");
    await page.locator('#appointment-completion-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal((await stored(fixture.legacy.id)).visitId, "");
    console.log("PASS same calendar-day choices across midnight/time differences, date changes, no-match state, editing/completion, historical-link preservation and explicit unlinking at 320px");
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
