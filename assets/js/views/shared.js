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
export function recordMeta(store, record, data) {
  if (store === "visits") {
    const root = visitHierarchy(data.visits).root(record);
    return (
      [
        data.doctors.find((d) => d.id === record.doctorId)?.name ||
          data.clinics.find((clinic) => clinic.id === record.clinicId)?.name,
        record.type,
        record.parentVisitId ? `Episode: ${root.reason}` : "",
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
      ...visits.map((visit) => `${visit.reason} (${dateLabel(visit.date)})`),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (store === "appointments")
    return (
      data.clinics.find((c) => c.id === record.clinicId)?.name || "Appointment"
    );
  return (
    record.instructions ||
    record.address ||
    record.notes ||
    definitions[store].singular
  );
}
export function recordRow(store, record, data, label) {
  const definition = definitions[store];
  const status = record.status;
  return `<a class="record-row ${["treatments", "medications"].includes(store) ? "care-record-row" : ""}" href="#/${store}/${e(record.id)}"><span class="record-icon tone-${store}">${icon(definition.icon)}</span><div class="record-body"><strong>${e(titleFor(store, record))}</strong><span>${e(label || recordMeta(store, record, data))}</span></div><div class="record-end">${status ? `<span class="status ${["Active", "Completed", "Resolved"].includes(status) ? "status-green" : "status-amber"}">${e(status)}</span>` : ""}${definition.date ? `<time>${e(dateLabel(record[definition.date]))}</time>` : ""}${icon("arrow")}</div></a>`;
}
