import { definitions, STORES } from "./schema.js";
import { validateRecord } from "../utils/validation.js";
import { validateRelationships } from "./relationships.js";

// Keep the original shape available to validate v1 backups BEFORE transforming them.
const text = (key, required = false) => ({
  key,
  label: key,
  type: "text",
  required,
});
const date = (key, required = false) => ({
  key,
  label: key,
  type: "date",
  required,
});
export const legacyDefinitions = {
  ...definitions,
  visits: {
    ...definitions.visits,
    fields: [
      ...definitions.visits.fields,
      {
        key: "medicationIds",
        label: "Medications",
        type: "reference",
        store: "medications",
        multiple: true,
      },
    ],
  },
  treatments: {
    ...definitions.treatments,
    fields: definitions.treatments.fields
      .filter(
        (field) =>
          !["medicationId", "dosage", "frequency", "doctorId"].includes(
            field.key,
          ),
      )
      .map((field) =>
        field.key === "startDate"
          ? { ...field, required: true }
          : field.key === "status"
            ? {
                ...field,
                options: ["Active", "Completed", "Planned", "Stopped"],
              }
            : field,
      ),
  },
  medications: {
    ...definitions.medications,
    fields: [
      text("name", true),
      text("dosage"),
      text("frequency"),
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["Active", "Completed", "Stopped", "As needed"],
      },
      date("startDate"),
      date("endDate"),
      { key: "doctorId", label: "Doctor", type: "reference", store: "doctors" },
      text("instructions"),
      text("notes"),
    ],
  },
};

export function migrateV1(source) {
  const data = Object.fromEntries(
    STORES.map((store) => [store, [...source[store]]]),
  );
  const used = new Set(data.treatments.map((record) => record.id));
  const courses = new Map();
  data.medications = [...source.medications]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((medication) => {
      // Deterministic IDs make repeated imports of the same v1 backup idempotent.
      // Retain valid UUID structure and resolve any cross-store ID collision without overwriting.
      let salt = 0x6d65646c;
      let id;
      do {
        id =
          ((parseInt(medication.id.slice(0, 8), 16) ^ salt++) >>> 0)
            .toString(16)
            .padStart(8, "0") + medication.id.slice(8);
      } while (used.has(id));
      used.add(id);
      courses.set(medication.id, id);
      data.treatments.push({
        id,
        name: medication.name,
        medicationId: medication.id,
        dosage: medication.dosage || "",
        frequency: medication.frequency || "",
        status: medication.status,
        startDate: medication.startDate || "",
        endDate: medication.endDate || "",
        doctorId: medication.doctorId || "",
        diagnosisId: "",
        instructions: medication.instructions || "",
        notes: medication.notes || "",
        createdAt: medication.createdAt,
        updatedAt: medication.updatedAt,
      });
      return {
        id: medication.id,
        name: medication.name,
        strength: "",
        form: "",
        notes: medication.notes || "",
        createdAt: medication.createdAt,
        updatedAt: medication.updatedAt,
      };
    });
  data.visits = source.visits.map((visit) => {
    const { medicationIds = [], ...record } = visit;
    return {
      ...record,
      treatmentIds: [
        ...new Set([
          ...(record.treatmentIds || []),
          ...medicationIds.map((id) => courses.get(id)),
        ]),
      ],
    };
  });
  for (const store of STORES)
    for (const record of data[store]) validateRecord(store, record);
  validateRelationships(data);
  return data;
}

export function migrateDatabase(transaction, onError) {
  const data = {};
  let remaining = STORES.length;
  for (const store of STORES)
    transaction.objectStore(store).getAll().onsuccess = (event) => {
      data[store] = event.target.result;
      if (--remaining) return;
      try {
        validateRelationships(data, legacyDefinitions);
        const migrated = migrateV1(data);
        for (const name of ["medications", "treatments", "visits"]) {
          for (const record of migrated[name])
            transaction.objectStore(name).put(record);
        }
      } catch (error) {
        onError(error);
        transaction.abort();
      }
    };
}
