// Visit diagnosis workflows, with isolated synthetic records only.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.MEDLY_PLAYWRIGHT_PATH || "playwright");
const baseURL = process.env.MEDLY_TEST_URL || "http://127.0.0.1:8080";
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
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const save = async () => {
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
  };
  try {
    await page.goto(`${baseURL}/#/visits`);
    await page.locator('[data-add="visits"]').first().click();
    assert.equal(
      await page.locator("#field-diagnosisIds, #field-treatmentIds").count(),
      0,
    );
    await page.locator("#field-reason").fill("Synthetic diagnosis episode");
    await page.locator("#field-date").fill("2026-03-01T10:00");
    await save();
    await page
      .getByRole("heading", {
        name: "Synthetic diagnosis episode",
        exact: true,
      })
      .waitFor();
    const visitId = await page.evaluate(() => location.hash.split("/")[2]);
    await page.locator('[data-add="diagnoses"]').click();
    await page
      .getByRole("heading", { name: "Add diagnosis", exact: true })
      .waitFor();
    assert.equal(await page.locator("#field-date").inputValue(), "2026-03-01");
    assert.equal(await page.locator("#field-reason").count(), 0);
    await page.locator("#field-name").fill("Synthetic diagnosis");
    await page.locator("#field-notes").fill("Synthetic clinical note");
    assert(
      await page
        .locator("#modal")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await save();
    await page
      .locator('main a[href^="#/diagnoses/"]')
      .getByText("Synthetic diagnosis", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => location.hash.split("/")[2]),
      visitId,
    );
    await page.locator('[data-add="diagnoses"]').click();
    await page.locator("#field-name").fill("Cancelled diagnosis");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#form-cancel").click();
    const diagnosisId = await page.evaluate(async () => {
      const data = await (
        await import("./assets/js/db/database.js")
      ).snapshot();
      if (data.diagnoses.length !== 1)
        throw Error("Cancellation created a diagnosis");
      return data.diagnoses[0].id;
    });
    await page.locator('[data-edit][data-store="visits"]').click();
    assert.equal(await page.locator("#field-diagnosisIds").count(), 0);
    await page.locator("#field-notes").fill("Edited visit note");
    await save();
    await page.locator(`a[href="#/diagnoses/${diagnosisId}"]`).click();
    await page
      .getByRole("heading", { name: "Related medical visits", exact: true })
      .waitFor();
    await page.locator('[data-edit][data-store="diagnoses"]').click();
    await page.locator("#field-name").fill("Edited synthetic diagnosis");
    await save();
    await page
      .getByRole("heading", { name: "Edited synthetic diagnosis", exact: true })
      .waitFor();
    console.log(
      "PASS visit forms omit diagnosis selector; separate mobile diagnosis modal, date defaults, cancellation, linked history, and independent editing",
    );
    const fixture = await page.evaluate(
      async ({ visitId, diagnosisId }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord, deleteRecord } = await import(
          "./assets/js/db/repository.js"
        );
        const stale = (await snapshot()).visits.find((v) => v.id === visitId);
        const another = await saveRecord(
          "diagnoses",
          {
            name: "Additional diagnosis",
            date: "2026-03-02",
            status: "Active",
          },
          undefined,
          { visitId },
        );
        await saveRecord("visits", { notes: "Stale clinical edit" }, stale);
        if (
          !(await snapshot()).visits
            .find((v) => v.id === visitId)
            .diagnosisIds.includes(another.id)
        )
          throw Error("Stale edit lost diagnosis link");
        const child = await saveRecord("visits", {
          reason: "Synthetic follow-up",
          date: "2026-03-02T10:00",
          type: "Follow-up",
          parentVisitId: visitId,
          diagnosisIds: [diagnosisId],
        });
        const course = await saveRecord(
          "treatments",
          { name: "Synthetic linked care", status: "Active", diagnosisId },
          undefined,
          { visitId },
        );
        const before = await snapshot();
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "visits")
            throw new DOMException("Synthetic failure", "QuotaExceededError");
          return put.apply(this, args);
        };
        let failed = false;
        try {
          await deleteRecord("diagnoses", diagnosisId);
        } catch {
          failed = true;
        }
        if (
          !failed ||
          JSON.stringify(await snapshot()) !== JSON.stringify(before)
        )
          throw Error("Diagnosis deletion did not roll back");
        failed = false;
        try {
          await saveRecord(
            "diagnoses",
            { name: "Failed diagnosis", date: "2026-03-02", status: "Active" },
            undefined,
            { visitId },
          );
        } catch {
          failed = true;
        } finally {
          IDBObjectStore.prototype.put = put;
        }
        if (
          !failed ||
          JSON.stringify(await snapshot()) !== JSON.stringify(before)
        )
          throw Error("Failed diagnosis creation left orphan data");
        failed = false;
        try {
          await saveRecord(
            "diagnoses",
            { name: "Missing visit", date: "2026-03-02", status: "Active" },
            undefined,
            { visitId: crypto.randomUUID() },
          );
        } catch {
          failed = true;
        }
        if (
          !failed ||
          JSON.stringify(await snapshot()) !== JSON.stringify(before)
        )
          throw Error("Missing visit created diagnosis");
        return {
          stale,
          childId: child.id,
          courseId: course.id,
          otherId: another.id,
        };
      },
      { visitId, diagnosisId },
    );
    await page.locator('[data-delete][data-store="diagnoses"]').click();
    await page
      .getByText(/removes its links from all visits and treatments/)
      .waitFor();
    await page.locator("#confirm-action").click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.evaluate(
      async ({ fixture, diagnosisId }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord } = await import("./assets/js/db/repository.js");
        await saveRecord(
          "visits",
          { notes: "Edit after deletion" },
          fixture.stale,
        );
        const data = await snapshot();
        if (
          data.diagnoses.some((d) => d.id === diagnosisId) ||
          data.visits.some((v) => v.diagnosisIds?.includes(diagnosisId))
        )
          throw Error("Deleted diagnosis or visit link remains");
        const course = data.treatments.find((c) => c.id === fixture.courseId);
        if (
          !course ||
          course.diagnosisId !== "" ||
          !data.visits.some((v) => v.id === fixture.childId)
        )
          throw Error("Diagnosis deletion removed linked care or follow-up");
        if (
          !data.visits
            .find((v) => v.id === fixture.stale.id)
            .diagnosisIds.includes(fixture.otherId)
        )
          throw Error("Deletion lost another diagnosis");
        const { createBackup, parseBackup, importBackup } = await import(
          "./assets/js/services/backup.js"
        );
        const backup = await createBackup();
        await importBackup(await parseBackup(backup), "replace");
        if (
          JSON.stringify((await createBackup()).data) !==
          JSON.stringify(backup.data)
        )
          throw Error("Diagnosis backup round trip failed");
      },
      { fixture, diagnosisId },
    );
    await page.goto(`${baseURL}/#/visits/${visitId}`);
    await page
      .getByRole("heading", { name: "Diagnoses", exact: true })
      .waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS atomic diagnosis creation/deletion, missing-visit rejection, stale edits, preserved visits/treatments, and backup round trip",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
