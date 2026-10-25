import { definitions } from "../db/schema.js";
import {
  escapeHTML as e,
  titleFor,
  dateLabel,
  bytesLabel,
} from "../utils/format.js";
import { searchRecords, events } from "../services/history.js";
import { icon } from "../components/icons.js";
import { pageHeader, addButton, emptyState, recordRow } from "./shared.js";

export function recordsPage(store, data) {
  const definition = definitions[store];
  const tabs = ["doctors", "clinics"].includes(store)
    ? `<div class="section-tabs"><a class="${store === "doctors" ? "active" : ""}" href="#/doctors">Doctors</a><a class="${store === "clinics" ? "active" : ""}" href="#/clinics">Clinics & hospitals</a></div>`
    : "";
  return `${pageHeader("YOUR HEALTH ARCHIVE", definition.label, definition.description, addButton(store))}${tabs}<section class="panel"><div class="filter-bar"><div class="search-input">${icon("search")}<input type="search" class="form-control" id="list-search" aria-label="Search ${e(definition.label.toLowerCase())}" placeholder="Search ${e(definition.label.toLowerCase())}…"></div><select id="sort" class="form-select" aria-label="Sort records"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div>${
    store === "visits"
      ? `<div class="visit-filters"><select class="form-select" id="filter-doctor" aria-label="Filter by doctor"><option value="">All doctors</option>${data.doctors.map((d) => `<option value="${d.id}">${e(d.name)}</option>`).join("")}</select><select class="form-select" id="filter-specialty" aria-label="Filter by specialty"><option value="">All specialties</option>${[
          ...new Set(data.doctors.map((d) => d.specialty).filter(Boolean)),
        ]
          .sort()
          .map((s) => `<option>${e(s)}</option>`)
          .join(
            "",
          )}</select><select class="form-select" id="filter-type" aria-label="Filter by visit type"><option value="">All visit types</option>${definition.fields
          .find((f) => f.key === "type")
          .options.map((t) => `<option>${e(t)}</option>`)
          .join(
            "",
          )}</select><label>From<input type="date" class="form-control" id="filter-from"></label><label>To<input type="date" class="form-control" id="filter-to"></label></div>`
      : ""
  }<div id="list-results"></div></section>`;
}
export function renderList(store, data) {
  const root = document.querySelector("#list-results");
  let records = searchRecords(
    data,
    document.querySelector("#list-search").value,
    store,
  ).map((r) => r.record);
  if (store === "visits") {
    const get = (id) => document.getElementById(`filter-${id}`).value;
    records = records.filter(
      (record) =>
        (!get("doctor") || record.doctorId === get("doctor")) &&
        (!get("specialty") ||
          data.doctors.find((d) => d.id === record.doctorId)?.specialty ===
            get("specialty")) &&
        (!get("type") || record.type === get("type")) &&
        (!get("from") || record.date.slice(0, 10) >= get("from")) &&
        (!get("to") || record.date.slice(0, 10) <= get("to")),
    );
  }
  const key = definitions[store].date || "createdAt";
  const sort = document.querySelector("#sort").value;
  records.sort((a, b) =>
    sort === "name"
      ? titleFor(store, a).localeCompare(titleFor(store, b))
      : sort === "oldest"
        ? (a[key] || a.createdAt).localeCompare(b[key] || b.createdAt)
        : (b[key] || b.createdAt).localeCompare(a[key] || a.createdAt),
  );
  root.innerHTML = records.length
    ? `<div class="results-label" role="status">${records.length} ${records.length === 1 ? "record" : "records"}</div><div class="record-list">${records.map((record) => recordRow(store, record, data)).join("")}</div>`
    : emptyState(
        definitions[store].icon,
        data[store].length
          ? "No matching records"
          : `Your ${definitions[store].label.toLowerCase()} start here`,
        data[store].length
          ? "Try another search or adjust your filters."
          : `Add your first ${definitions[store].singular.toLowerCase()} to start building your personal archive.`,
        data[store].length ? "" : addButton(store),
      );
}

export function detailPage(store, id, data) {
  const record = data[store].find((r) => r.id === id);
  if (!record)
    return emptyState(
      "document",
      "Record not found",
      "It may have been removed in another tab.",
      `<a class="btn btn-primary" href="#/${store}">Back to records</a>`,
    );
  const definition = definitions[store];
  const sections = definition.fields
    .filter((f) => record[f.key]?.length)
    .map((field) => {
      let content;
      if (field.type === "reference") {
        const ids = field.multiple ? record[field.key] : [record[field.key]];
        const linked = data[field.store].filter((r) => ids.includes(r.id));
        content =
          linked
            .map(
              (r) =>
                `<a class="linked-chip" href="#/${field.store}/${r.id}">${e(titleFor(field.store, r))} ${icon("arrow")}</a>`,
            )
            .join("") || "Not linked";
        if (store === "visits" && field.key === "doctorId") {
          const clinic = data.clinics.find((c) => c.id === linked[0]?.clinicId);
          if (clinic)
            content += `<a class="linked-chip" href="#/clinics/${clinic.id}">${e(clinic.name)}</a>`;
        }
      } else
        content = e(
          field.type === "date" || field.type === "datetime-local"
            ? dateLabel(
                record[field.key],
                field.type === "datetime-local"
                  ? { hour: "2-digit", minute: "2-digit" }
                  : {},
              )
            : record[field.key],
        );
      return `<div class="detail-field ${field.type === "textarea" || field.multiple ? "wide" : ""}"><dt>${e(field.label)}</dt><dd>${content}</dd></div>`;
    })
    .join("");
  let extra = "";
  if (store === "visits") {
    const docs = data.documents.filter((d) => d.visitId === id);
    const appointments = data.appointments.filter((a) => a.visitId === id);
    extra = `<section class="panel mt-4"><div class="panel-heading"><h2>Medical documents</h2><button class="btn btn-outline-primary btn-sm" data-add="documents" data-visit="${id}">${icon("plus")} Attach document</button></div>${docs.length ? docs.map((d) => recordRow("documents", d, data)).join("") : emptyState("document", "Keep the paperwork together", "Attach reports, test results, scans, or prescriptions to this visit.")}</section>${appointments.length ? `<section class="panel mt-4"><div class="panel-heading"><h2>Linked appointments</h2></div>${appointments.map((a) => recordRow("appointments", a, data)).join("")}</section>` : ""}`;
  }
  if (store === "doctors")
    extra = `<section class="panel mt-4"><div class="panel-heading"><h2>Medical visits</h2></div>${
      data.visits
        .filter((v) => v.doctorId === id)
        .map((v) => recordRow("visits", v, data))
        .join("") ||
      emptyState(
        "visit",
        "No visits yet",
        "Visits linked to this doctor will appear here.",
      )
    }</section>`;
  if (store === "clinics")
    extra = `<section class="panel mt-4"><div class="panel-heading"><h2>Doctors at this clinic</h2></div>${
      data.doctors
        .filter((d) => d.clinicId === id)
        .map((d) => recordRow("doctors", d, data))
        .join("") ||
      emptyState(
        "doctor",
        "No doctors linked",
        "Link a doctor to this clinic from the doctor’s form.",
      )
    }</section>`;
  return `<a href="#/${store}" class="back-link">← ${e(definition.label)}</a>${pageHeader(definition.singular, titleFor(store, record), `Added ${dateLabel(record.createdAt)} · Updated ${dateLabel(record.updatedAt)}`, `<div class="action-group"><button class="btn btn-outline-primary" data-edit="${id}" data-store="${store}">Edit</button><button class="btn btn-light text-danger" data-delete="${id}" data-store="${store}">Delete</button></div>`)}${store === "appointments" && record.status === "Scheduled" ? `<div class="notice mb-4">After your appointment, create or link a medical visit and mark this appointment as completed.<button class="btn btn-outline-primary btn-sm" data-complete="${id}">Complete appointment</button></div>` : ""}<section class="panel detail-panel"><dl class="detail-grid">${sections}</dl>${store === "documents" ? `<div class="document-controls"><span>${e(record.type)} · ${bytesLabel(record.size)}</span><div class="action-group"><button class="btn btn-primary" data-preview="${id}">Preview</button><button class="btn btn-outline-primary" data-download="${id}">Download original</button></div></div><div id="document-preview"></div>` : ""}</section>${extra}`;
}

export function timelinePage(data) {
  const history = events(data);
  let previousMonth;
  return `${pageHeader("THE BIGGER PICTURE", "Your health timeline", "The moments that make up your story, brought together.")}<section class="timeline">${
    history.length
      ? history
          .map((event) => {
            const month = dateLabel(event.date, {
              month: "long",
              year: "numeric",
              day: undefined,
            });
            const header =
              previousMonth !== month
                ? `<h2 class="timeline-month">${e(month)}</h2>`
                : "";
            previousMonth = month;
            return `${header}<div class="timeline-entry"><time>${e(dateLabel(event.date))}</time><div class="panel">${recordRow(event.store, event.record, data, event.label)}</div></div>`;
          })
          .join("")
      : emptyState(
          "timeline",
          "Your history, in one place",
          "Visits, diagnoses, treatments, and documents appear automatically. Tests and procedures are included in your visits.",
          addButton("visits"),
        )
  }</section>`;
}

export function searchPage() {
  return `${pageHeader("FIND A LITTLE CLARITY", "Search your archive", "Search visits, providers, diagnoses, treatments, medications, tests, and notes.")}<section class="panel"><label class="visually-hidden" for="global-search">Search all records</label><div class="search-input large-search">${icon("search")}<input type="search" class="form-control" id="global-search" placeholder="What are you looking for?" autocomplete="off"></div><div id="search-results">${emptyState("search", "Your whole history, within reach", "Start typing a name, symptom, test, or anything you remember.")}</div></section>`;
}
export function renderSearch(data) {
  const query = document.querySelector("#global-search").value.trim();
  const results = query ? searchRecords(data, query) : [];
  document.querySelector("#search-results").innerHTML = !query
    ? emptyState(
        "search",
        "Your whole history, within reach",
        "Start typing to search all your records.",
      )
    : results.length
      ? `<div class="results-label" role="status">${results.length} matching records</div>${results.map(({ store, record }) => recordRow(store, record, data, definitions[store].singular)).join("")}`
      : emptyState(
          "search",
          "No matching records",
          "Try a different word, a provider’s name, or part of a note.",
        );
}
