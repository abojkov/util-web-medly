// Medication-library / treatment-course regression tests. Synthetic isolated data only.
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
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("**/migration-test.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Synthetic migration fixture</title>",
      }),
    );
    await page.goto(`${baseURL}/migration-test.html`);
    const fixture = await page.evaluate(async () => {
      const meta = () => ({
        id: crypto.randomUUID(),
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
        ].map((store) => [store, []]),
      );
      const doctor = { ...meta(), name: "Synthetic prescriber" };
      data.doctors.push(doctor);
      const existing = {
        ...meta(),
        name: "Synthetic non-medication care",
        startDate: "2026-01-01",
        status: "Completed",
        instructions: "Keep original care",
        notes: "Original treatment",
      };
      data.treatments.push(existing);
      for (let i = 1; i <= 5; i++) {
        const medication = {
          ...meta(),
          name: "Synthetic medicine",
          dosage: `Original dose ${i}`,
          frequency: `Original frequency ${i}`,
          status: i === 5 ? "As needed" : "Completed",
          startDate: i === 1 ? "" : `2026-01-${String(i).padStart(2, "0")}`,
          endDate: i === 1 ? "" : `2026-01-${String(i + 1).padStart(2, "0")}`,
          doctorId: doctor.id,
          instructions: `Original instructions ${i}`,
          notes: `Original notes ${i}`,
        };
        data.medications.push(medication);
        data.visits.push({
          ...meta(),
          reason: `Synthetic episode ${i}`,
          date: `2026-01-${String(i).padStart(2, "0")}T10:00`,
          type: "General consultation",
          doctorId: doctor.id,
          medicationIds: [medication.id],
          treatmentIds: i === 1 ? [existing.id] : [],
          diagnosisIds: [],
          notes: "Original visit notes",
          followUpInstructions: "Original return advice",
          followUpDate: "2027-01-20",
        });
      }
      const pdf = "%PDF-1.4\nSynthetic legacy attachment\n%%EOF";
      const attachment = {
        ...meta(),
        name: "legacy.pdf",
        visitId: data.visits[0].id,
        description: "Legacy attachment",
        type: "application/pdf",
        size: pdf.length,
        blob: new Blob([pdf], { type: "application/pdf" }),
      };
      data.documents.push(attachment);
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("medly", 1);
        request.onupgradeneeded = () => {
          for (const name of Object.keys(data))
            request.result.createObjectStore(name, { keyPath: "id" });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(Object.keys(data), "readwrite");
          for (const [name, records] of Object.entries(data))
            for (const record of records) tx.objectStore(name).put(record);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      });
      return {
        data: {
          ...data,
          documents: [{ ...attachment, blob: undefined, base64: btoa(pdf) }],
        },
        doctorId: doctor.id,
      };
    });
    const legacyBackup = {
      format: "medly-backup",
      schemaVersion: 1,
      appVersion: "1.0.0",
      exportedAt: "2026-02-01T12:00:00.000Z",
      data: fixture.data,
    };
    await page.goto(baseURL);
    await page
      .getByRole("heading", { name: "Your health, together." })
      .waitFor();
    await page.evaluate(async (legacy) => {
      const ensure = (condition, message) => {
        if (!condition) throw Error(message);
      };
      const { snapshot, openDatabase } = await import(
        "./assets/js/db/database.js"
      );
      const { parseBackup, importBackup } = await import(
        "./assets/js/services/backup.js"
      );
      const data = await snapshot();
      ensure(
        data.visits[0].notes ===
          "Original visit notes\n\nFollow-up instructions: Original return advice\n\nRecommended review date: 2027-01-20",
        "legacy advice preserved in notes",
      );
      ensure(
        !("followUpDate" in data.visits[0]) &&
          !("followUpInstructions" in data.visits[0]),
        "retired fields removed",
      );
      ensure((await openDatabase()).version === 9, "schema upgraded to 9");
      ensure(
        data.medications.length === 5 && data.treatments.length === 6,
        "all legacy prescriptions preserved without name-based merging",
      );
      for (const medication of legacy.data.medications) {
        const library = data.medications.find(
          (record) => record.id === medication.id,
        );
        ensure(
          library && !("dosage" in library) && !("status" in library),
          "library has no course fields",
        );
        const course = data.treatments.find(
          (record) => record.medicationId === medication.id,
        );
        ensure(
          course &&
            course.dosage === medication.dosage &&
            course.frequency === medication.frequency &&
            course.status === medication.status &&
            course.startDate === medication.startDate &&
            course.endDate === medication.endDate &&
            course.instructions === medication.instructions &&
            course.notes === medication.notes &&
            course.doctorId === medication.doctorId,
          "all prescription details preserved",
        );
        const originalVisit = legacy.data.visits.find((visit) =>
          visit.medicationIds.includes(medication.id),
        );
        const visit = data.visits.find(
          (record) => record.id === originalVisit.id,
        );
        ensure(
          visit.treatmentIds.includes(course.id) && !("medicationIds" in visit),
          "visit relinked to migrated course",
        );
      }
      ensure(
        (await data.documents[0].blob.text()) ===
          "%PDF-1.4\nSynthetic legacy attachment\n%%EOF",
        "legacy attachment survives upgrade",
      );
      const migratedBackup = await parseBackup(JSON.stringify(legacy));
      ensure(
        migratedBackup.treatments
          .map((course) => course.id)
          .sort()
          .join() ===
          data.treatments
            .map((course) => course.id)
            .sort()
            .join(),
        "live and backup migrations produce same course IDs",
      );
      await importBackup(migratedBackup);
      ensure((await snapshot()).treatments.length === 6, "v1 backup restores");
      let blocked = false;
      const invalid = structuredClone(legacy);
      invalid.data.medications[0].doctorId = crypto.randomUUID();
      try {
        await parseBackup(invalid);
      } catch {
        blocked = true;
      }
      ensure(
        blocked && (await snapshot()).treatments.length === 6,
        "invalid legacy relationships rejected before writing",
      );
    }, legacyBackup);
    console.log(
      "PASS real v1→current schema upgrade, every legacy field and attachment, unknown dates and v1 backup restoration",
    );

    // Review and explicitly combine the five migrated entries. Courses stay separate.
    const targetId = fixture.data.medications[0].id;
    for (const source of fixture.data.medications.slice(1)) {
      await page.goto(`${baseURL}/#/medications/${source.id}`);
      await page.locator("[data-combine-medication]").click();
      await page.locator("#combine-target").selectOption(targetId);
      await page.locator("#combine-review").click();
      await page
        .getByRole("heading", { name: "Combine these medication entries?" })
        .waitFor();
      await page.locator("#confirm-action").click();
      await page.waitForFunction(() => !document.querySelector("#modal").open);
    }
    await page.evaluate(async () => {
      const data = await (
        await import("./assets/js/db/database.js")
      ).snapshot();
      if (data.medications.length !== 1 || data.treatments.length !== 6)
        throw Error("Combination lost library/course data");
      if (!data.medications[0].notes.includes("Original notes 5"))
        throw Error("Source notes lost");
      if (
        data.treatments.filter(
          (course) => course.medicationId === data.medications[0].id,
        ).length !== 5
      )
        throw Error("Not all courses moved");
    });
    console.log(
      "PASS confirmed library combination preserves all courses, metadata and visit links",
    );

    // Save a new visit, then reuse the latest course, reset episode dates/status and keep one library item.
    await page.goto(`${baseURL}/#/visits`);
    await page.locator('[data-add="visits"]').first().click();
    await page.locator("#field-title").fill("Synthetic repeat episode");
    await page.locator("#field-date").fill("2026-03-01T09:00");
    assert.equal(await page.locator("#field-medicationIds").count(), 0);
    assert.equal(
      await page
        .locator("#field-treatmentIds, .visit-treatment-section")
        .count(),
      0,
    );
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page
      .getByRole("heading", { name: "Synthetic repeat episode", exact: true })
      .waitFor();
    await page.locator('[data-add="treatments"]').click();
    await page
      .getByRole("heading", { name: "Add treatment", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("#field-title, #field-treatmentIds").count(),
      0,
    );
    const reuseOptions = await page
      .locator("#field-reuse option")
      .allTextContents();
    assert(
      reuseOptions[1].includes("Jan 5") || reuseOptions[1].includes("5 Jan"),
      "Latest course should be first",
    );
    await page.locator("#field-reuse").selectOption({ index: 1 });
    assert.equal(
      await page.locator("#field-dosage").inputValue(),
      "Original dose 5",
    );
    assert.equal(
      await page.locator("#field-startDate").inputValue(),
      "2026-03-01",
    );
    assert.equal(await page.locator("#field-endDate").inputValue(), "");
    assert.equal(await page.locator("#field-status").inputValue(), "Active");
    await page.locator("#field-dosage").fill("New episode dose");
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page
      .getByRole("heading", { name: "Synthetic repeat episode", exact: true })
      .waitFor();
    const newVisitId = await page.evaluate(() => location.hash.split("/")[2]);
    const courseId = await page.evaluate(async (id) => {
      const data = await (
        await import("./assets/js/db/database.js")
      ).snapshot();
      const visit = data.visits.find((visit) => visit.id === id);
      const course = data.treatments.find(
        (course) => course.id === visit.treatmentIds[0],
      );
      if (
        data.medications.length !== 1 ||
        data.treatments.length !== 7 ||
        course.dosage !== "New episode dose"
      )
        throw Error("Repeated course did not reuse library correctly");
      if (
        !data.treatments.some((course) => course.dosage === "Original dose 5")
      )
        throw Error("Reuse modified the original course");
      return course.id;
    }, newVisitId);

    // From the visit detail, create each treatment in its own modal.
    await page.locator('[data-add="treatments"]').click();
    await page.locator("#field-medicationId").selectOption("__new__");
    await page
      .locator("#field-medicine-name")
      .fill("Second synthetic medicine");
    await page.locator("#field-medicine-strength").fill("Synthetic strength");
    await page.locator("#field-medicine-form").fill("Synthetic form");
    await page.locator("#field-dosage").fill("Synthetic new prescription");
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.locator('[data-add="treatments"]').click();
    await page.locator("#field-name").fill("Synthetic physiotherapy course");
    await page
      .locator("#field-instructions")
      .fill("Synthetic care instructions");
    // Save this treatment directly.
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page
      .locator("main")
      .getByText("Synthetic physiotherapy course", { exact: true })
      .waitFor();
    await page.evaluate(async (id) => {
      const data = await (
        await import("./assets/js/db/database.js")
      ).snapshot();
      if (
        data.medications.length !== 2 ||
        data.visits.find((visit) => visit.id === id).treatmentIds.length !== 3
      )
        throw Error("Separate treatments were not linked to the visit");
    }, newVisitId);
    console.log(
      "PASS separate visit treatment modals, reuse with fresh dates, new library medicine and non-medication care",
    );

    // Cancelling the treatment modal must not leave orphan records.
    const counts = () =>
      page.evaluate(async () =>
        Object.fromEntries(
          Object.entries(
            await (await import("./assets/js/db/database.js")).snapshot(),
          ).map(([name, rows]) => [name, rows.length]),
        ),
      );
    const beforeCancel = await counts();
    await page.locator('[data-add="treatments"]').click();
    await page.locator("#field-medicationId").selectOption("__new__");
    await page
      .locator("#field-medicine-name")
      .fill("Uncommitted synthetic medicine");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#form-cancel").click();
    assert.deepEqual(await counts(), beforeCancel);

    // Edit this course only; its older sibling must not change.
    await page.goto(`${baseURL}/#/treatments/${courseId}`);
    await page.locator("[data-edit]").click();
    await page.locator("#field-dosage").fill("Edited new course dose");
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.evaluate(async () => {
      const { snapshot } = await import("./assets/js/db/database.js");
      const { saveRecord } = await import("./assets/js/db/repository.js");
      const before = await snapshot();
      if (
        !before.treatments.some((course) => course.dosage === "Original dose 5")
      )
        throw Error("Historical dosage changed");
      let rejected = false;
      try {
        await saveRecord("medications", {
          name: "  SYNTHETIC MEDICINE  ",
          strength: "",
          form: "",
        });
      } catch {
        rejected = true;
      }
      if (
        !rejected ||
        (await snapshot()).medications.length !== before.medications.length
      )
        throw Error("Exact duplicate library entry accepted");
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "visits")
          throw new DOMException(
            "Synthetic quota failure",
            "QuotaExceededError",
          );
        return originalPut.apply(this, args);
      };
      const medicineId = crypto.randomUUID(),
        treatmentId = crypto.randomUUID();
      rejected = false;
      try {
        await saveRecord(
          "treatments",
          {
            id: treatmentId,
            name: "Rollback course",
            medicationId: medicineId,
            status: "Active",
          },
          undefined,
          {
            medications: [{ id: medicineId, name: "Rollback medicine" }],
            visitId: before.visits[0].id,
          },
        );
      } catch {
        rejected = true;
      } finally {
        IDBObjectStore.prototype.put = originalPut;
      }
      const after = await snapshot();
      if (
        !rejected ||
        Object.keys(before).some(
          (name) => before[name].length !== after[name].length,
        )
      )
        throw Error("Atomic visit failure left orphan courses/medicines");
      const { createBackup, parseBackup, importBackup } = await import(
        "./assets/js/services/backup.js"
      );
      const backup = await createBackup();
      if (backup.schemaVersion !== 9) throw Error("Wrong export schema");
      await importBackup(await parseBackup(JSON.stringify(backup)));
      if (
        JSON.stringify(backup, (key, value) =>
          key === "exportedAt" ? undefined : value,
        ) !==
        JSON.stringify(await createBackup(), (key, value) =>
          key === "exportedAt" ? undefined : value,
        )
      )
        throw Error("v2 round trip changed care data");
    });
    console.log(
      "PASS cancel has no writes, duplicate prevention, independent course edits, atomic visit rollback and current-schema backup round trip",
    );

    await page.setViewportSize({ width: 320, height: 750 });
    await page.goto(`${baseURL}/#/visits/${newVisitId}`);
    await page.locator('[data-add="treatments"]').click();
    await page.locator("#field-medicationId").selectOption("__new__");
    assert(
      await page
        .locator("#modal")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Inline editor overflows at 320px",
    );
    await page.screenshot({
      path: "/tmp/medly-inline-treatment.png",
      fullPage: true,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-close]").click();
    await page.goto(`${baseURL}/#/medications/${targetId}`);
    await page
      .getByRole("heading", { name: "Synthetic medicine", exact: true })
      .waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "/tmp/medly-medication-history.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS 320px treatment modal and medication course history; no browser errors",
    );

    // Clinical edits preserve links changed after the form opened. Deletion is atomic.
    const deletionState = await page.evaluate(
      async ({ courseId, newVisitId }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord, deleteRecord } = await import(
          "./assets/js/db/repository.js"
        );
        const initial = await snapshot();
        const stale = initial.visits.find((v) => v.id === newVisitId);
        const extra = await saveRecord(
          "treatments",
          { name: "Concurrent care", status: "Active" },
          undefined,
          { visitId: newVisitId },
        );
        await saveRecord(
          "visits",
          { notes: "Clinical edit from stale form" },
          stale,
        );
        if (
          !(await snapshot()).visits
            .find((v) => v.id === newVisitId)
            .treatmentIds.includes(extra.id)
        )
          throw Error("Clinical edit lost new treatment link");
        const sibling = await saveRecord("visits", {
          title: "Historical shared treatment",
          date: "2026-03-02T10:00",
          type: "Other",
          treatmentIds: [courseId],
        });
        const before = await snapshot();
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "visits")
            throw new DOMException(
              "Synthetic delete failure",
              "QuotaExceededError",
            );
          return put.apply(this, args);
        };
        let failed = false;
        try {
          await deleteRecord("treatments", courseId);
        } catch {
          failed = true;
        } finally {
          IDBObjectStore.prototype.put = put;
        }
        if (
          !failed ||
          JSON.stringify(await snapshot()) !== JSON.stringify(before)
        )
          throw Error(
            "Treatment delete failure did not roll back links and treatment",
          );
        failed = false;
        try {
          await saveRecord(
            "treatments",
            { name: "Missing visit care", status: "Active" },
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
          throw Error("Missing visit left orphan treatment");
        return {
          siblingId: sibling.id,
          medicineId: before.treatments.find((c) => c.id === courseId)
            .medicationId,
          stale,
        };
      },
      { courseId, newVisitId },
    );
    await page.goto(`${baseURL}/#/treatments/${courseId}`);
    await page.locator("[data-delete]").click();
    await page.getByText(/removes its links from all visits/).waitFor();
    await page.locator("#confirm-action").click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.evaluate(
      async ({ courseId, deletionState }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord } = await import("./assets/js/db/repository.js");
        const data = await snapshot();
        if (
          data.treatments.some((c) => c.id === courseId) ||
          data.visits.some((v) => v.treatmentIds?.includes(courseId))
        )
          throw Error("Deleted treatment or dangling links remain");
        if (
          !data.medications.some((m) => m.id === deletionState.medicineId) ||
          !data.visits.some((v) => v.id === deletionState.siblingId)
        )
          throw Error("Treatment deletion removed medicine or visit");
        await saveRecord(
          "visits",
          { notes: "Edit after treatment deletion" },
          deletionState.stale,
        );
        if (
          (await snapshot()).visits.some((v) =>
            v.treatmentIds?.includes(courseId),
          )
        )
          throw Error("Stale edit restored deleted care link");
      },
      { courseId, deletionState },
    );
    console.log(
      "PASS treatment deletion unlinks all visits, preserves medicines, rolls back on failure and stale clinical edits retain current links",
    );

    // A failed version-change transaction must leave both records and schema at v1.
    const rollbackContext = await browser.newContext({
      serviceWorkers: "block",
    });
    try {
      const rollback = await rollbackContext.newPage();
      await rollback.route("**/migration-test.html", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic rollback fixture</title>",
        }),
      );
      await rollback.goto(`${baseURL}/migration-test.html`);
      await rollback.evaluate(async (backup) => {
        const data = structuredClone(backup.data);
        for (const document of data.documents) {
          document.blob = new Blob([atob(document.base64)], {
            type: document.type,
          });
          delete document.base64;
        }
        await new Promise((resolve, reject) => {
          const request = indexedDB.open("medly", 1);
          request.onupgradeneeded = () => {
            for (const name of Object.keys(data))
              request.result.createObjectStore(name, { keyPath: "id" });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
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
      }, legacyBackup);
      await rollback.addInitScript(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (
            this.transaction.mode === "versionchange" &&
            this.name === "treatments"
          )
            throw new DOMException(
              "Synthetic migration storage failure",
              "QuotaExceededError",
            );
          return put.apply(this, args);
        };
      });
      await rollback.goto(baseURL);
      await rollback
        .getByRole("heading", { name: "Your archive could not be opened" })
        .waitFor();
      await rollback.evaluate(async () => {
        await new Promise((resolve, reject) => {
          const request = indexedDB.open("medly");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            if (db.version !== 1)
              return reject(
                Error("Failed upgrade changed the database version"),
              );
            const tx = db.transaction(
              ["medications", "visits", "treatments"],
              "readonly",
            );
            const checks = {};
            tx.objectStore("medications").getAll().onsuccess = (event) => {
              checks.medications =
                event.target.result.length === 5 &&
                event.target.result.every((record) =>
                  record.dosage.startsWith("Original dose"),
                );
            };
            tx.objectStore("visits").getAll().onsuccess = (event) => {
              checks.visits = event.target.result.every(
                (record) => record.medicationIds.length === 1,
              );
            };
            tx.objectStore("treatments").getAll().onsuccess = (event) => {
              checks.treatments =
                event.target.result.length === 1 &&
                !tx
                  .objectStore("treatments")
                  .indexNames.contains("medicationId");
            };
            tx.oncomplete = () => {
              db.close();
              Object.values(checks).every(Boolean)
                ? resolve()
                : reject(
                    Error(
                      "Failed migration partially changed legacy data or indexes",
                    ),
                  );
            };
            tx.onabort = () => reject(tx.error);
          };
        });
      });
      console.log(
        "PASS failed database upgrade rolls back schema, indexes and all prescription/visit changes",
      );
    } finally {
      await rollbackContext.close();
    }
  } catch (error) {
    await page
      .screenshot({ path: "/tmp/medly-care-failure.png", fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
