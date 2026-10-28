import { openDatabase, snapshot, clearDatabase } from "./db/database.js";
import { definitions } from "./db/schema.js";
import { deleteRecord, combineMedications } from "./db/repository.js";
import { medicineLabel, medicineChoiceLabel } from "./utils/care.js";
import { createBackup, parseBackup, importBackup } from "./services/backup.js";
import { route, initRouter } from "./router.js";
import { icon } from "./components/icons.js";
import { recordForm } from "./components/record-form.js";
import { appointmentCompletion } from "./components/appointment-completion.js";
import {
  showDialog,
  closeDialog,
  confirmAction,
  reportError,
  notify,
} from "./components/feedback.js";
import { escapeHTML as e, download } from "./utils/format.js";
import { dashboard } from "./views/dashboard.js";
import {
  recordsPage,
  renderList,
  detailPage,
  timelinePage,
  searchPage,
  renderSearch,
} from "./views/records.js";
import { settingsPage } from "./views/settings.js";
import { emptyState, pageHeader } from "./views/shared.js";

const main = document.querySelector("#main");
let data;
let previewURL;
const documentURLs = new WeakMap();
let rendering = 0;
let initialized = false;
const channel = globalThis.BroadcastChannel
  ? new BroadcastChannel("medly-changes")
  : null;
const navItems = [
  ["dashboard", "Overview", "dashboard"],
  ["visits", "Medical visits", "visit"],
  ["diagnoses", "Diagnoses", "diagnosis"],
  ["treatments", "Treatments", "treatment"],
  ["medications", "Medication library", "medication"],
  ["doctors", "Doctors & clinics", "doctor"],
  ["documents", "Documents", "document"],
  ["timeline", "Health timeline", "timeline"],
  ["appointments", "Appointments", "calendar"],
  ["settings", "Settings & backups", "settings"],
];
function navigation(page) {
  const active = page === "clinics" ? "doctors" : page;
  document.querySelector("#desktop-nav").innerHTML = navItems
    .map(
      ([key, title, glyph], i) =>
        `${i === 7 ? '<span class="nav-divider"></span>' : ""}<a href="#/${key}" class="nav-link ${active === key ? "active" : ""}" ${active === key ? 'aria-current="page"' : ""}>${icon(glyph)}${title}</a>`,
    )
    .join("");
  document.querySelector("#mobile-nav").innerHTML =
    [navItems[0], navItems[1], navItems[6], navItems[8]]
      .map(
        ([key, title, glyph]) =>
          `<a href="#/${key}" class="${active === key ? "active" : ""}" ${active === key ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${key === "dashboard" ? "Overview" : key === "visits" ? "Visits" : key === "appointments" ? "Calendar" : title}</span></a>`,
      )
      .join("") +
    `<button id="more-menu" class="${!["dashboard", "visits", "documents", "appointments"].includes(active) ? "active" : ""}" aria-label="More sections">${icon("more")}<span>More</span></button>`;
  document.querySelector("#more-menu").onclick = () => {
    showDialog(
      "Your health space",
      `<nav class="more-menu">${navItems.map(([key, title, glyph]) => `<a href="#/${key}">${icon(glyph)}${title}${icon("arrow")}</a>`).join("")}</nav>`,
    );
    document
      .querySelectorAll(".more-menu a")
      .forEach((link) => (link.onclick = closeDialog));
  };
}

async function storageInfo() {
  try {
    return {
      ...(await navigator.storage?.estimate()),
      persisted: await navigator.storage?.persisted?.(),
    };
  } catch {
    return {};
  }
}

async function render() {
  const generation = ++rendering;
  try {
    const currentData = await snapshot();
    const { page, id } = route();
    const storage = page === "settings" ? await storageInfo() : {};
    if (generation !== rendering) return;
    data = currentData;
    if (previewURL) {
      URL.revokeObjectURL(previewURL);
      previewURL = undefined;
    }
    navigation(page);
    const title =
      page === "dashboard"
        ? "Overview"
        : definitions[page]?.label ||
          {
            timeline: "Health timeline",
            settings: "Settings & backups",
            search: "Search",
          }[page] ||
          "Page not found";
    document.title = `${title} · Medly`;
    if (definitions[page])
      main.innerHTML = id
        ? detailPage(page, id, data)
        : recordsPage(page, data);
    else if (page === "dashboard") main.innerHTML = dashboard(data);
    else if (page === "timeline") main.innerHTML = timelinePage(data);
    else if (page === "settings") main.innerHTML = settingsPage(data, storage);
    else if (page === "search") main.innerHTML = searchPage();
    else
      main.innerHTML =
        pageHeader(
          "A SMALL DETOUR",
          "Page not found",
          "Let’s get you back to your health archive.",
        ) + '<a class="btn btn-primary" href="#/dashboard">Go to overview</a>';
    if (definitions[page] && !id) {
      const update = () => renderList(page, data);
      update();
      document.querySelector("#list-search").oninput = debounce(update);
      main
        .querySelectorAll('select, input[type="date"]')
        .forEach((input) => (input.onchange = update));
    }
    if (page === "search") {
      document.querySelector("#global-search").oninput = debounce(() =>
        renderSearch(data),
      );
      document.querySelector("#global-search").focus();
    }
    if (page === "settings") bindSettings();
    initialized = true;
  } catch (error) {
    if (!initialized) {
      main.innerHTML = emptyState(
        "shield",
        "Your archive could not be opened",
        "Medly needs persistent browser storage. Enable storage, leave private browsing or close other Medly tabs, then reload. No temporary database will be used.",
        '<button class="btn btn-primary" id="retry-storage">Try again</button>',
      );
      document.querySelector("#retry-storage").onclick = render;
    }
    reportError(error);
  }
}
function debounce(callback) {
  let timer;
  return (event) => {
    const source = event.currentTarget;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (source.isConnected) callback();
    }, 220);
  };
}
async function changed() {
  channel?.postMessage("changed");
  await render();
}

main.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !data) return;
  try {
    if (button.dataset.followup) {
      const parent = data.visits.find(
        (visit) => visit.id === button.dataset.followup,
      );
      if (parent.parentVisitId)
        throw new Error(
          "Add follow-ups from the initial visit. Follow-ups cannot follow other follow-ups.",
        );
      recordForm(
        "visits",
        data,
        undefined,
        async (saved) => {
          await changed();
          location.hash = `#/visits/${saved.id}`;
        },
        {
          parentVisitId: parent.id,
          doctorId: parent.doctorId || "",
          clinicId: parent.doctorId ? "" : parent.clinicId || "",
          type: "Follow-up",
          title: `Follow-up: ${parent.title}`,
        },
      );
    }
    if (button.dataset.add) {
      const store = button.dataset.add;
      if (["treatments", "diagnoses"].includes(store) && button.dataset.visit) {
        const visit = data.visits.find(
          (visit) => visit.id === button.dataset.visit,
        );
        recordForm(store, data, undefined, changed, {
          visitId: button.dataset.visit,
          ...(store === "diagnoses"
            ? { date: visit?.date.slice(0, 10) }
            : {
                startDate: visit?.date.slice(0, 10),
                doctorId: visit?.doctorId || "",
              }),
        });
        return;
      }
      recordForm(
        store,
        data,
        undefined,
        async (saved) => {
          await changed();
          if (store === "documents" && button.dataset.visit) {
            const section = document.querySelector("#visit-documents");
            section?.focus({ preventScroll: true });
            section?.scrollIntoView({ block: "start" });
            return;
          }
          location.hash = `#/${store}/${saved.id}`;
        },
        button.dataset.visit
          ? { visitId: button.dataset.visit }
          : button.dataset.medication
            ? {
                medicationId: button.dataset.medication,
                name: data.medications.find(
                  (medicine) => medicine.id === button.dataset.medication,
                )?.name,
              }
            : {},
      );
    }
    if (button.dataset.combineMedication) {
      const sourceId = button.dataset.combineMedication;
      const source = data.medications.find(
        (medicine) => medicine.id === sourceId,
      );
      showDialog(
        "Combine library entries",
        `<p>Move courses from <strong>${e(medicineLabel(source))}</strong> into the entry you choose below. Review strength and form. All courses remain separate and source details are retained in the kept entry’s notes.</p><label class="form-label" for="combine-target">Medication entry to keep</label><select class="form-select" id="combine-target">${data.medications
          .filter((medicine) => medicine.id !== sourceId)
          .map(
            (medicine) =>
              `<option value="${medicine.id}">${e(medicineChoiceLabel(medicine, data))}</option>`,
          )
          .join(
            "",
          )}</select><div class="dialog-actions"><button class="btn btn-light" id="combine-cancel">Cancel</button><button class="btn btn-primary" id="combine-review">Review combination</button></div>`,
      );
      document.querySelector("#combine-cancel").onclick = closeDialog;
      document.querySelector("#combine-review").onclick = () => {
        const targetId = document.querySelector("#combine-target").value;
        const target = data.medications.find(
          (medicine) => medicine.id === targetId,
        );
        confirmAction(
          "Combine these medication entries?",
          `Keep “${medicineLabel(target)}” and remove “${medicineLabel(source)}” from the library. Move its courses to the kept entry without combining or deleting any treatment history.`,
          async () => {
            await combineMedications(sourceId, targetId);
            await changed();
            location.hash = `#/medications/${targetId}`;
            notify(
              "Library entries combined. All treatment courses were preserved.",
            );
          },
          "Combine entries",
        );
      };
    }
    if (button.dataset.edit)
      recordForm(
        button.dataset.store,
        data,
        data[button.dataset.store].find((r) => r.id === button.dataset.edit),
        changed,
      );
    if (button.dataset.delete) {
      const store = button.dataset.store;
      const visitId =
        store === "documents"
          ? data.documents.find((doc) => doc.id === button.dataset.delete)?.visitId
          : "";
      confirmAction(
        `Delete ${definitions[store].singular.toLowerCase()}?`,
        store === "treatments"
          ? "This permanently deletes the treatment and removes its links from all visits. Visits and the library medication are kept. This cannot be undone without a backup."
          : store === "diagnoses"
            ? "This permanently deletes the diagnosis and removes its links from all visits and treatments. Visits and treatments are kept. This cannot be undone without a backup."
            : "This permanently removes this record from this device. Linked records must be unlinked first. This cannot be undone without a backup.",
        async () => {
          await deleteRecord(store, button.dataset.delete);
          channel?.postMessage("changed");
          location.hash = visitId ? `#/visits/${visitId}` : `#/${store}`;
          notify("Record deleted.");
        },
      );
    }
    if (button.dataset.download) {
      const doc = data.documents.find((d) => d.id === button.dataset.download);
      download(doc.blob, doc.name);
    }
    if (button.dataset.openDocument) {
      const doc = data.documents.find(
        (doc) => doc.id === button.dataset.openDocument,
      );
      // Native viewers may read the file later. Keep its URL alive until page unload.
      if (!documentURLs.has(doc.blob))
        documentURLs.set(doc.blob, URL.createObjectURL(doc.blob));
      const link = document.createElement("a");
      link.href = documentURLs.get(doc.blob);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }
    if (button.dataset.preview) {
      const doc = data.documents.find((d) => d.id === button.dataset.preview);
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(doc.blob);
      const target = document.querySelector("#document-preview");
      target.replaceChildren();
      const preview = document.createElement(
        doc.type === "application/pdf" ? "iframe" : "img",
      );
      preview.src = previewURL;
      if (preview.tagName === "IMG") preview.alt = doc.description || doc.name;
      else {
        preview.title = doc.name;
        // Native PDF viewers provide their own isolation; iframe sandbox blocks Chrome’s viewer.
      }
      target.append(preview);
      if (doc.type === "application/pdf") {
        const hint = document.createElement("p");
        hint.className = "form-text";
        hint.textContent =
          "PDF preview depends on your browser. If it does not display, use Download original.";
        const open = document.createElement("a");
        open.href = previewURL;
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        open.className = "btn btn-outline-primary btn-sm";
        open.textContent = "Open PDF in new tab";
        target.append(hint, open);
      }
    }
    if (button.dataset.complete) {
      const original = data.appointments.find(
        (a) => a.id === button.dataset.complete,
      );
      appointmentCompletion(original, data, changed);
    }
  } catch (error) {
    reportError(error);
  }
});

function bindSettings() {
  document.querySelector("#export-backup").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Preparing backup…";
    try {
      const backup = await createBackup();
      const exportedAt = new Date(backup.exportedAt);
      const pad = (value) => String(value).padStart(2, "0");
      const date = `${exportedAt.getFullYear()}${pad(exportedAt.getMonth() + 1)}${pad(exportedAt.getDate())}`;
      const time = `${pad(exportedAt.getHours())}${pad(exportedAt.getMinutes())}`;
      download(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
        `medly-bckp-${date}-${time}.json`,
      );
      notify("Backup prepared. Keep the downloaded file somewhere private.");
    } catch (error) {
      reportError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Export full backup";
    }
  };
  document.querySelector("#import-backup").onclick = async (event) => {
    const file = document.querySelector("#import-file").files[0];
    const mode = document.querySelector("#import-mode").value;
    if (!file) return notify("Choose a Medly JSON backup first.", true);
    if (file.size > 250 * 1024 * 1024)
      return notify(
        "This backup exceeds the 250 MB import limit. Keep your archive backups below this size.",
        true,
      );
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Validating backup…";
    try {
      const incoming = await parseBackup(await file.text());
      const count = Object.values(incoming).reduce(
        (sum, list) => sum + list.length,
        0,
      );
      confirmAction(
        mode === "replace"
          ? "Replace your entire archive?"
          : "Merge this backup?",
        `${count} records validated, including ${incoming.documents.length} documents. ${mode === "replace" ? "All current records will be replaced. Export a backup of your current archive first. This cannot be undone." : "Existing IDs will be merged, keeping the version with the newest updated timestamp. No duplicate IDs will be added."}`,
        async () => {
          await importBackup(incoming, mode);
          await changed();
          notify("Your backup was restored successfully.");
        },
        mode === "replace" ? "Replace archive" : "Merge backup",
      );
    } catch (error) {
      reportError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Review import";
    }
  };
  document.querySelector("#clear-data").onclick = () =>
    confirmAction(
      "Permanently clear all data?",
      "Every medical record and document in this browser will be deleted. Export a backup first. This action cannot be undone.",
      async () => {
        await clearDatabase();
        await changed();
        notify("All local records have been cleared.");
      },
      "Clear all data",
    );
  document.querySelector("#persist-storage").onclick = async () => {
    try {
      const enabled = await navigator.storage?.persist?.();
      document.querySelector("#persist-status").textContent = enabled
        ? "Persistent storage is enabled. Keep exporting backups regularly."
        : "Your browser did not grant persistent storage. Back up regularly to keep your records safe.";
    } catch (error) {
      reportError(error);
    }
  };
  document.querySelector("#check-update").onclick = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration) {
        document.querySelector("#update-status").textContent =
          "Offline support requires HTTPS or localhost and a supported browser.";
        return;
      }
      await registration.update();
      if (registration.waiting)
        confirmAction(
          "Update Medly?",
          "The app will reload to install the downloaded update. Your medical records stay in IndexedDB.",
          async () => {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          },
          "Update & reload",
        );
      else
        document.querySelector("#update-status").textContent =
          registration.installing
            ? "An update is downloading. Check again in a moment."
            : "You have the latest available app version.";
    } catch {
      document.querySelector("#update-status").textContent =
        "Could not check for updates. Check your internet connection.";
    }
  };
}

document.querySelector("#open-search").onclick = () => {
  location.hash = "#/search";
  if (route().page === "search")
    document.querySelector("#global-search")?.focus();
};
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) &&
    !document.querySelector("#modal").open
  ) {
    event.preventDefault();
    location.hash = "#/search";
    document.querySelector("#global-search")?.focus();
  }
});
channel &&
  (channel.onmessage = () => {
    if (document.querySelector("#modal").open)
      notify(
        "Another Medly tab changed your archive. Finish or close this form, then navigate to refresh.",
      );
    else render();
  });
addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  reportError(event.reason);
});
addEventListener("beforeunload", (event) => {
  if (
    document.querySelector("#modal").open &&
    document.querySelector("#modal form")?.dataset.dirty === "true"
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
addEventListener("error", () =>
  notify(
    "An unexpected application error occurred. Reload Medly if the problem continues.",
    true,
  ),
);
initRouter(render);
try {
  await openDatabase();
  await render();
} catch (error) {
  await render();
}
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled) location.reload();
    controlled = true;
  });
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() =>
      notify(
        "Offline support could not be enabled. Your records still save locally.",
        true,
      ),
    );
}
