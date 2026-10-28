import {
  escapeHTML as e,
  dateLabel,
  titleFor,
  bytesLabel,
} from "../utils/format.js";
import { definitions } from "../db/schema.js";
import { icon } from "../components/icons.js";
import { medicineLabel, newestCourses } from "../utils/care.js";
import { visitHierarchy } from "../utils/visits.js";
export const addButton = (store, label) =>
  `<button class="btn btn-primary" data-add="${store}">${icon("plus")}${e(label || `Add ${definitions[store].singular.toLowerCase()}`)}</button>`;
export const pageHeader = (eyebrow, title, description, action = "") =>
  `<div class="page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1>${e(title)}</h1><p class="page-description">${e(description)}</p></div>${action}</div>`;
export function emptyState(iconName, title, description, action = "") {
  return `<div class="empty-state"><span class="empty-icon">${icon(iconName)}</span><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
}
export function recordMeta(store, record, data, { visitContext = false } = {}) {
  if (store === "visits") {
    const root = visitHierarchy(data.visits).root(record);
    return (
      [
        data.doctors.find((d) => d.id === record.doctorId)?.name ||
          data.clinics.find((clinic) => clinic.id === record.clinicId)?.name,
        record.type,
        record.parentVisitId ? `Episode: ${root.title}` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "Medical visit"
    );
  }
  if (store === "doctors")
    return (
      [
        record.specialty,
        data.clinics.find((c) => c.id === record.clinicId)?.name,
      ]
        .filter(Boolean)
        .join(" · ") || "Healthcare provider"
    );
  if (store === "documents")
    return `${record.type.replace("application/", "").replace("image/", "").toUpperCase()} · ${bytesLabel(record.size)}`;
  if (store === "medications") {
    const courses = newestCourses(
      data.treatments.filter((course) => course.medicationId === record.id),
    );
    return [
      record.strength,
      record.form,
      `${courses.length} ${courses.length === 1 ? "course" : "courses"}`,
      courses[0]
        ? courses[0].startDate
          ? `Most recent: ${dateLabel(courses[0].startDate)}`
          : "Most recent course: start date unknown"
        : "No courses yet",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (store === "treatments") {
    const medicine = data.medications.find(
      (medicine) => medicine.id === record.medicationId,
    );
    const visits = data.visits.filter((visit) =>
      visit.treatmentIds?.includes(record.id),
    );
    return [
      medicine ? medicineLabel(medicine) : "Non-medication care",
      record.dosage,
      record.frequency,
      ...(visitContext
        ? []
        : visits.map((visit) => `${visit.title} (${dateLabel(visit.date)})`)),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (store === "appointments") {
    const doctor = data.doctors.find((item) => item.id === record.doctorId);
    const clinicId = doctor ? doctor.clinicId : record.clinicId;
    return [doctor?.name, data.clinics.find((item) => item.id === clinicId)?.name]
      .filter(Boolean).join(" · ") || "Appointment";
  }
  return (
    record.instructions ||
    record.address ||
    record.notes ||
    definitions[store].singular
  );
}
export function recordRow(store, record, data, label, { visitContext = false } = {}) {
  const definition = definitions[store];
  const status = record.status;
  const showPeriod = store === "treatments" && visitContext;
  const period = showPeriod
    ? [
        record.startDate ? dateLabel(record.startDate) : "Start unknown",
        record.endDate
          ? dateLabel(record.endDate)
          : ["Completed", "Stopped"].includes(status)
            ? "End unknown"
            : "No end date",
      ].join(" - ")
    : "";
  const row = `<a class="record-row ${["treatments", "medications"].includes(store) ? "care-record-row" : ""}" href="#/${store}/${e(record.id)}"><span class="record-icon tone-${store}">${icon(definition.icon)}</span><div class="record-body"><strong>${e(titleFor(store, record))}</strong><span>${e(label || recordMeta(store, record, data, { visitContext }))}</span></div><div class="record-end">${status ? `<span class="status ${["Active", "Completed", "Resolved"].includes(status) ? "status-green" : "status-amber"}">${e(status)}</span>` : ""}${showPeriod ? `<span class="status treatment-period" aria-label="Treatment period">${e(period)}</span>` : definition.date ? `<time>${e(dateLabel(record[definition.date]))}</time>` : ""}${icon("arrow")}</div></a>`;
  if (store === "documents" && visitContext)
    return `<div class="visit-document-row">${row}<button type="button" class="icon-button" data-open-document="${e(record.id)}" aria-label="Open document in new tab: ${e(record.name)}" title="Open document in new tab">${icon("open")}</button></div>`;
  return row;
}
