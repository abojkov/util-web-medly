import { definitions } from "../db/schema.js";
import { today, titleFor } from "../utils/format.js";
export function events(data) {
  const result = [];
  for (const store of ["visits", "diagnoses", "treatments", "documents"])
    for (const record of data[store]) {
      result.push({
        store,
        record,
        title: titleFor(store, record),
        date: record[definitions[store].date] || record.createdAt,
        label:
          store === "treatments"
            ? record.startDate
              ? "Treatment started"
              : "Treatment recorded (start date unknown)"
            : definitions[store].singular,
      });
      if (
        store === "treatments" &&
        record.endDate &&
        record.status === "Completed"
      )
        result.push({
          store,
          record,
          title: record.name,
          date: record.endDate,
          label: "Treatment completed",
        });
    }
  return result.sort((a, b) => b.date.localeCompare(a.date));
}
export function upcoming(data) {
  const result = data.appointments
    .filter((a) => a.status === "Scheduled")
    .map((record) => ({
      store: "appointments",
      record,
      title: record.reason,
      date: record.date,
      label:
        record.date <
        new Date().toLocaleString("sv").slice(0, 16).replace(" ", "T")
          ? "Overdue appointment"
          : "Appointment",
    }));
  for (const record of data.visits)
    if (record.followUpDate && record.followUpDate >= today())
      result.push({
        store: "visits",
        record,
        title: record.reason,
        date: record.followUpDate,
        label: "Follow-up",
      });
  for (const record of data.treatments)
    if (
      record.endDate &&
      record.endDate >= today() &&
      ["Active", "Planned"].includes(record.status)
    )
      result.push({
        store: "treatments",
        record,
        title: record.name,
        date: record.endDate,
        label: "Treatment ends",
      });
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
export function searchRecords(data, query, onlyStore) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = [];
  for (const [store, records] of Object.entries(data)) {
    if (onlyStore && store !== onlyStore) continue;
    for (const record of records) {
      const values = definitions[store].fields.flatMap((field) => {
        const value = record[field.key];
        if (field.type === "reference") {
          const ids = field.multiple ? value || [] : [value];
          return data[field.store]
            .filter((item) => ids.includes(item.id))
            .flatMap((item) => [
              titleFor(field.store, item),
              item.specialty || "",
              item.notes || "",
            ]);
        }
        return value || "";
      });
      if (store === "visits") {
        const doctor = data.doctors.find((d) => d.id === record.doctorId);
        const clinic = data.clinics.find((c) => c.id === doctor?.clinicId);
        if (clinic) values.push(clinic.name);
        for (const course of data.treatments.filter((course) =>
          record.treatmentIds?.includes(course.id),
        )) {
          values.push(
            course.name,
            course.dosage || "",
            course.frequency || "",
            course.instructions || "",
          );
          const medicine = data.medications.find(
            (medicine) => medicine.id === course.medicationId,
          );
          if (medicine)
            values.push(
              medicine.name,
              medicine.strength || "",
              medicine.form || "",
            );
        }
      }
      const haystack = values.join(" ").toLocaleLowerCase();
      if (terms.every((term) => haystack.includes(term)))
        results.push({ store, record });
    }
  }
  return results;
}
