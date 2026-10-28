// Real-browser episode/hierarchy tests with isolated synthetic data only.
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
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const save = async () => {
    await page.locator('#record-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
  };
  const openVisit = async (id) => {
    await page.goto(`${baseURL}/#/visits/${id}`);
    await page.locator(".episode-section").waitFor();
  };
  const list = async () => {
    await page.goto(`${baseURL}/#/dashboard`);
    await page
      .getByRole("heading", { name: "Your health, together." })
      .waitFor();
    await page.goto(`${baseURL}/#/visits`);
    await page.locator("#list-results").waitFor();
  };
  try {
    await page.goto(baseURL);
    await page
      .getByRole("heading", { name: "Your health, together." })
      .waitFor();
    const providers = await page.evaluate(async () => {
      const { saveRecord } = await import("./assets/js/db/repository.js");
      const first = await saveRecord("doctors", {
        name: "Synthetic original doctor",
        specialty: "Synthetic general care",
      });
      const second = await saveRecord("doctors", {
        name: "Synthetic follow-up doctor",
        specialty: "Synthetic review specialty",
      });
      return { first: first.id, second: second.id };
    });
    await list();
    await page.locator('[data-add="visits"]').first().click();
    assert.equal(await page.locator("#field-parentVisitId").count(), 0);
    await page.locator("#field-title").fill("Synthetic flu episode");
    await page.locator("#field-date").fill("2026-01-01T10:00");
    await page.locator("#field-doctorId").selectOption(providers.first);
    await page.locator("#field-findings").fill("Initial synthetic findings");
    assert.equal(
      await page
        .locator("#field-followUpDate, #field-followUpInstructions")
        .count(),
      0,
    );
    await save();
    await page
      .getByRole("heading", { name: "Synthetic flu episode", exact: true })
      .waitFor();
    const rootId = await page.evaluate(() => location.hash.split("/")[2]);

    const addFollowup = async (reason, date, first = false) => {
      await openVisit(rootId);
      await page
        .locator(".episode-section > .panel-heading [data-followup]")
        .click();
      assert.equal(await page.locator("#field-parentVisitId").count(), 0);
      await page
        .getByRole("heading", { name: "Add follow-up visit", exact: true })
        .waitFor();
      assert.equal(await page.locator("#field-type").inputValue(), "Follow-up");
      assert.equal(await page.locator("#field-findings").inputValue(), "");
      assert.equal(
        await page.locator("#field-doctorId").inputValue(),
        providers.first,
      );
      await page.locator("#field-title").fill(reason);
      await page.locator("#field-date").fill(date);
      await page.locator("#field-findings").fill(`Findings for ${reason}`);
      if (first) {
        await page.locator("#field-doctorId").selectOption(providers.second);
        await page
          .locator("#field-notes")
          .fill(
            '<img src=x onerror="window.__unsafeFollowup=true"> Unique recovery note',
          );
      }
      await save();
      await page.getByRole("heading", { name: reason, exact: true }).waitFor();
      if (first) {
        await page.locator('[data-add="treatments"]').click();
        await page.locator("#field-medicationId").selectOption("__new__");
        await page
          .locator("#field-medicine-name")
          .fill("Synthetic episode medicine");
        await page.locator("#field-dosage").fill("Synthetic recorded dose");
        await page
          .locator("#field-frequency")
          .fill("Synthetic recorded frequency");
        await page
          .locator("#field-instructions")
          .fill("Synthetic instructions visible inside the episode");
        await save();
      }
      return page.evaluate(() => location.hash.split("/")[2]);
    };
    const firstId = await addFollowup(
      "Synthetic review one",
      "2026-01-03T11:00",
      true,
    );
    const secondId = await addFollowup(
      "Synthetic review two",
      "2026-01-06T12:00",
    );
    const thirdId = await addFollowup(
      "Synthetic review three",
      "2026-01-09T13:00",
    );
    const fourthId = await addFollowup(
      "Synthetic review four",
      "2026-01-11T14:00",
    );
    await page.evaluate(async (firstId) => {
      const blob = new Blob(["%PDF-1.4\nSynthetic episode document\n%%EOF"], {
        type: "application/pdf",
      });
      await (
        await import("./assets/js/db/repository.js")
      ).saveRecord("documents", {
        name: "Synthetic follow-up report.pdf",
        description: "Linked only to the first follow-up",
        visitId: firstId,
        blob,
        type: blob.type,
        size: blob.size,
      });
    }, firstId);
    await openVisit(rootId);
    assert.equal(
      await page.locator(".episode-section .followup-node").count(),
      4,
    );
    assert.equal(
      await page.locator(".episode-section > .followup-tree > li").count(),
      4,
      "All follow-ups link directly to the initial visit",
    );
    assert.equal(
      await page
        .locator(".followup-tree .followup-tree .followup-tree .followup-node")
        .count(),
      0,
      "No nested follow-ups",
    );
    await page
      .getByText("Synthetic instructions visible inside the episode", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("link", {
        name: "Synthetic follow-up report.pdf",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.__unsafeFollowup), undefined);
    await page.screenshot({
      path: "/tmp/medly-episode-desktop.png",
      fullPage: true,
    });

    await list();
    await page.getByText("1 episode", { exact: true }).waitFor();
    assert.equal(
      await page.locator(".record-list > a.record-row").count(),
      1,
      "Only the initial visit is a top-level list row",
    );
    const group = page.locator(`[data-episode="${rootId}"]`);
    assert.equal(await group.evaluate((node) => node.tagName), "A");
    assert.equal(
      await page
        .locator("#list-results details, #list-results .followup-node")
        .count(),
      0,
    );
    await group.getByText("4 follow-ups", { exact: true }).waitFor();
    assert(
      (await group.textContent()).includes("Synthetic review four"),
      "Latest follow-up is identified",
    );
    await group.click();
    await page
      .getByRole("heading", { name: "Synthetic flu episode", exact: true })
      .waitFor();
    assert.equal(await page.locator(".followup-parent").count(), 0);
    await page
      .getByRole("button", {
        name: "Edit visit: Synthetic review three",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Edit follow-up visit", exact: true })
      .waitFor();
    await page.locator("#form-cancel").click();
    await page
      .getByRole("link", {
        name: "Open visit: Synthetic review three",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Synthetic review three", exact: true })
      .waitFor();
    await list();
    await page.screenshot({
      path: "/tmp/medly-episode-list.png",
      fullPage: true,
    });

    // A separate illness stays a separate episode.
    await page.locator('[data-add="visits"]').first().click();
    assert.equal(await page.locator("#field-parentVisitId").count(), 0);
    await page.locator("#field-title").fill("Synthetic unrelated episode");
    await page.locator("#field-date").fill("2026-02-01T09:00");
    await save();
    await page
      .getByRole("heading", {
        name: "Synthetic unrelated episode",
        exact: true,
      })
      .waitFor();
    const otherId = await page.evaluate(() => location.hash.split("/")[2]);
    await list();
    await page.getByText("2 episodes", { exact: true }).waitFor();

    // Every filter searches all visits but returns the owning episode.
    await page.locator(".visit-search > summary").click();
    await page.locator("#list-search").fill("Synthetic review two");
    await page.getByText("1 episode", { exact: true }).waitFor();
    await page
      .locator(`[data-episode="${rootId}"] .episode-match`)
      .getByText("1 matching follow-up", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("#list-results .followup-node, #list-results details")
        .count(),
      0,
    );
    await page.locator("#list-search").fill("");
    await page.getByText("2 episodes", { exact: true }).waitFor();
    await page.locator("#filter-from").fill("2026-01-06");
    await page.locator("#filter-to").fill("2026-01-06");
    await page.getByText("1 episode", { exact: true }).waitFor();
    assert.equal(await page.locator(`[data-episode="${rootId}"]`).count(), 1);
    await page.locator("#filter-from").fill("");
    await page.locator("#filter-to").fill("");
    await page.locator("#filter-doctor").selectOption(providers.second);
    await page
      .locator("#filter-specialty")
      .selectOption("Synthetic review specialty");
    await page.locator("#filter-type").selectOption("Follow-up");
    await page.getByText("1 episode", { exact: true }).waitFor();
    assert.equal(await page.locator("#list-results .followup-node").count(), 0);
    await page.goto(`${baseURL}/#/search`);
    await page.locator("#global-search").fill("Unique recovery note");
    await page
      .locator(`#search-results a[href="#/visits/${firstId}"]`)
      .waitFor();
    console.log(
      "PASS four direct follow-ups, independent encounters/care/documents, top-level episode grouping and child search/date/provider/type filters",
    );

    // Parent selection is never exposed in forms; database integrity still protects stored links.
    await openVisit(rootId);
    await page.locator(".page-heading [data-edit]").click();
    assert.equal(await page.locator("#field-parentVisitId").count(), 0);
    await page.locator("#form-cancel").click();
    await page.evaluate(
      async ({ rootId, thirdId }) => {
        const { snapshot } = await import("./assets/js/db/database.js");
        const { saveRecord, deleteRecord } = await import(
          "./assets/js/db/repository.js"
        );
        const { createBackup, parseBackup } = await import(
          "./assets/js/services/backup.js"
        );
        const initial = await snapshot(),
          root = initial.visits.find((visit) => visit.id === rootId);
        const followup = initial.visits.find((visit) => visit.id === thirdId);
        const anotherFollowup = initial.visits.find(
          (visit) => visit.parentVisitId === rootId && visit.id !== thirdId,
        );
        let nestedRejected = false;
        try {
          await saveRecord(
            "visits",
            { ...followup, parentVisitId: anotherFollowup.id },
            followup,
          );
        } catch {
          nestedRejected = true;
        }
        if (!nestedRejected)
          throw Error("A follow-up was allowed to follow another follow-up");
        for (const parentVisitId of [rootId, thirdId, crypto.randomUUID()]) {
          let failed = false;
          try {
            await saveRecord("visits", { ...root, parentVisitId }, root);
          } catch {
            failed = true;
          }
          if (!failed)
            throw Error("Self/descendant/missing parent was accepted");
        }
        let failed = false;
        try {
          await deleteRecord("visits", rootId);
        } catch {
          failed = true;
        }
        if (!failed) throw Error("Parent deleted while follow-ups exist");
        const medicineId = crypto.randomUUID(),
          courseId = crypto.randomUUID();
        failed = false;
        try {
          await saveRecord(
            "visits",
            { ...root, parentVisitId: thirdId, treatmentIds: [courseId] },
            root,
            {
              medications: [{ id: medicineId, name: "Should roll back" }],
              treatments: [
                {
                  id: courseId,
                  name: "Should roll back",
                  medicationId: medicineId,
                  status: "Active",
                },
              ],
            },
          );
        } catch {
          failed = true;
        }
        const after = await snapshot();
        if (
          !failed ||
          after.medications.length !== initial.medications.length ||
          after.treatments.length !== initial.treatments.length ||
          after.visits.find((visit) => visit.id === rootId).parentVisitId
        )
          throw Error(
            "Cycle failure did not roll back the visit and its new care records",
          );
        const backup = await createBackup();
        const nested = structuredClone(backup);
        nested.data.visits.find((visit) => visit.id === thirdId).parentVisitId =
          anotherFollowup.id;
        nestedRejected = false;
        try {
          await parseBackup(nested);
        } catch {
          nestedRejected = true;
        }
        if (!nestedRejected)
          throw Error("Current-schema backup accepted nested follow-ups");
        for (const parentVisitId of [rootId, thirdId, crypto.randomUUID()]) {
          const bad = structuredClone(backup);
          bad.data.visits.find((visit) => visit.id === rootId).parentVisitId =
            parentVisitId;
          failed = false;
          try {
            await parseBackup(bad);
          } catch {
            failed = true;
          }
          if (!failed) throw Error("Invalid hierarchy accepted in backup");
        }
      },
      { rootId, thirdId },
    );

    // Editing clinical fields cannot detach or reassign an existing follow-up.
    await openVisit(secondId);
    assert.equal(
      await page.locator("[data-followup]").count(),
      0,
      "Connected follow-ups can be added only from the initial visit page",
    );
    await page.locator(".page-heading [data-edit]").click();
    assert.equal(await page.locator("#field-parentVisitId").count(), 0);
    await page
      .locator("#field-notes")
      .fill("Edited clinical note; keep the episode link");
    await save();
    await page.evaluate(
      async ({ rootId, secondId }) => {
        const data = await (
          await import("./assets/js/db/database.js")
        ).snapshot();
        const visit = data.visits.find((visit) => visit.id === secondId);
        if (
          visit.parentVisitId !== rootId ||
          !visit.notes.startsWith("Edited clinical note") ||
          data.visits.filter((visit) => visit.parentVisitId === rootId)
            .length !== 4
        )
          throw Error("Editing changed follow-up membership");
      },
      { rootId, secondId },
    );
    await list();
    await page.getByText("2 episodes", { exact: true }).waitFor();
    console.log(
      "PASS no parent selector, follow-up-only entry point, preserved links during edits and transactional relationship protection",
    );

    const legacy = await page.evaluate(
      async ({ rootId, otherId }) => {
        const { saveRecord } = await import("./assets/js/db/repository.js");
        const { createBackup, parseBackup, importBackup } = await import(
          "./assets/js/services/backup.js"
        );
        const a = await saveRecord("visits", {
          title: "Backup fixture A",
          date: "2026-02-02T10:00",
          type: "Other",
        });
        const b = await saveRecord("visits", {
          title: "Backup fixture B",
          date: "2026-02-03T10:00",
          type: "Other",
        });
        const backup = await createBackup();
        await importBackup(await parseBackup(JSON.stringify(backup)));
        const restored = await createBackup();
        if (
          JSON.stringify(backup.data) !== JSON.stringify(restored.data) ||
          backup.schemaVersion !== 9
        )
          throw Error("Episode backup round trip failed");
        const legacy = structuredClone(backup);
        legacy.schemaVersion = 2;
        legacy.appVersion = "1.1.0";
        for (const visit of legacy.data.visits) {
          visit.reason = visit.title;
          delete visit.title;
          if (Object.hasOwn(visit, "reasonAndSymptoms")) {
            visit.symptoms = visit.reasonAndSymptoms;
            delete visit.reasonAndSymptoms;
          }
          delete visit.parentVisitId;
          delete visit.clinicId;
        }
        const old = await parseBackup(JSON.stringify(legacy));
        if (
          old.visits.length !== backup.data.visits.length ||
          old.visits.some((visit) => visit.parentVisitId)
        )
          throw Error("Legacy v2 backup rejected or links guessed");
        return legacy;
      },
      { rootId, otherId },
    );
    await openVisit(rootId);
    await page.reload();
    await page.locator(".episode-section .followup-node").first().waitFor();
    assert.equal(
      await page.locator(".episode-section .followup-node").count(),
      4,
    );
    await page.setViewportSize({ width: 320, height: 750 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Episode overflows at 320px",
    );
    assert(
      await page
        .locator(".followup-actions .icon-button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) =>
              button.getBoundingClientRect().height <= 70 &&
              button.getBoundingClientRect().width >= 44,
          ),
        ),
      "Nested follow-up actions must remain readable at 320px",
    );
    await page.screenshot({
      path: "/tmp/medly-episode-mobile.png",
      fullPage: true,
    });
    await list();
    assert.equal(await page.locator("#list-results details").count(), 0);
    await page.locator(`[data-episode="${rootId}"]`).click();
    await page.locator(".followup-node").first().waitFor();
    assert.equal(
      await page
        .locator(
          ".episode-section details, .episode-section summary, .followup-chevron",
        )
        .count(),
      0,
      "Follow-up cards must not expose expand/collapse controls",
    );
    for (const content of await page.locator(".followup-content").all()) {
      assert(await content.isVisible(), "Follow-up details must stay visible");
    }
    assert.equal(
      await page.locator(".followup-actions .icon-button").count(),
      8,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Compact follow-up detail view overflows at 320px",
    );
    assert.equal(
      await page.locator(".followup-node [data-followup]").count(),
      0,
      "Follow-ups must not offer nested follow-up creation",
    );
    await openVisit(firstId);
    assert.equal(await page.locator("[data-followup]").count(), 0);
    await openVisit(rootId);
    await page
      .locator(".episode-section > .panel-heading [data-followup]")
      .click();
    assert.equal(await page.locator("#field-parentVisitId").count(), 0);
    assert(
      await page
        .locator("#modal")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      "Follow-up form overflows",
    );
    // No new visit is committed by opening/cancelling the prefilled form.
    await page.locator("[data-close]").click();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.goto(`${baseURL}/#/visits/${rootId}`);
    await page.reload();
    await page.locator(".episode-section .followup-node").first().waitFor();
    assert.equal(
      await page.locator(".episode-section .followup-node").count(),
      4,
    );
    await context.setOffline(false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS schema-9 backup round trip, reload persistence, nested mobile layouts and offline episode history",
    );

    // Upgrade an actual v2 archive: preserve every record and add the index without guessing links.
    const oldContext = await browser.newContext({ serviceWorkers: "block" });
    try {
      const oldPage = await oldContext.newPage();
      await oldPage.route("**/old-archive.html", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic old archive</title>",
        }),
      );
      await oldPage.goto(`${baseURL}/old-archive.html`);
      await oldPage.evaluate(async (backup) => {
        const data = structuredClone(backup.data);
        for (const file of data.documents) {
          file.blob = new Blob([atob(file.base64)], { type: file.type });
          delete file.base64;
        }
        await new Promise((resolve, reject) => {
          const request = indexedDB.open("medly", 2);
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
      }, legacy);
      await oldPage.goto(baseURL);
      await oldPage
        .getByRole("heading", { name: "Your health, together." })
        .waitFor();
      await oldPage.evaluate(async (backup) => {
        const { openDatabase } = await import("./assets/js/db/database.js");
        const db = await openDatabase();
        if (
          db.version !== 9 ||
          !db
            .transaction("visits")
            .objectStore("visits")
            .indexNames.contains("parentVisitId")
        )
          throw Error("v2 archive did not upgrade to indexed v9 schema");
        const current = await (
          await import("./assets/js/services/backup.js")
        ).createBackup();
        for (const document of backup.data.documents) {
          const visit = backup.data.visits.find(
            (v) => v.id === document.visitId,
          );
          if (visit && !("issueDate" in document))
            document.issueDate = visit.date.slice(0, 10);
        }
        backup.data.visits = backup.data.visits.map(({ reason, symptoms, ...visit }) => ({
          ...visit,
          title: reason,
          ...(symptoms !== undefined ? { reasonAndSymptoms: symptoms } : {}),
        }));
        if (
          current.data.documents.some(
            (document) =>
              document.issueDate !==
              backup.data.documents.find((old) => old.id === document.id)
                ?.issueDate,
          ) ||
          JSON.stringify(current.data, (key, value) =>
            key === "issueDate" ? undefined : value && typeof value === "object" && !Array.isArray(value)
              ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value,
          ) !==
            JSON.stringify(backup.data, (key, value) =>
              key === "issueDate" ? undefined : value && typeof value === "object" && !Array.isArray(value)
                ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value,
            )
        )
          throw Error("v2→v9 upgrade rewrote or lost existing archive data");
      }, legacy);
      console.log(
        "PASS populated v2→v9 upgrade preserves records, attachments and unlinked historical follow-ups",
      );
    } finally {
      await oldContext.close();
    }
  } catch (error) {
    await page
      .screenshot({ path: "/tmp/medly-followups-failure.png", fullPage: true })
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
