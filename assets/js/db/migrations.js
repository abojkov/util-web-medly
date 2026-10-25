import { definitions, STORES } from "./schema.js";
import { validateRecord } from "../utils/validation.js";
import {
  validateRelationships,
  validateVisitHierarchy,
} from "./relationships.js";
import { visitHierarchy } from "../utils/visits.js";

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
export const version4Definitions = {
  ...definitions,
  visits: {
    ...definitions.visits,
    fields: [
      ...definitions.visits.fields.map((field) =>
        field.key === "notes" ? text("notes") : field,
      ),
      text("followUpInstructions"),
      date("followUpDate"),
    ],
  },
};
export const version2Definitions = {
  ...definitions,
  visits: {
    ...version4Definitions.visits,
    fields: version4Definitions.visits.fields.filter(
      (field) => field.key !== "parentVisitId",
    ),
  },
};
export const legacyDefinitions = {
  ...definitions,
  visits: {
    ...definitions.visits,
    fields: [
      ...version2Definitions.visits.fields,
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
  data.visits = data.visits.map(moveVisitFollowupNotes);
  for (const store of STORES)
    for (const record of data[store]) validateRecord(store, record);
  validateRelationships(data);
  return data;
}

export function migrateDatabase(transaction, onError, onComplete = () => {}) {
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
        onComplete();
      } catch (error) {
        onError(error);
        transaction.abort();
      }
    };
}

export function flattenFollowups(visits) {
  validateVisitHierarchy(visits, { allowNested: true });
  const tree = visitHierarchy(visits);
  return visits.map((visit) => {
    if (!visit.parentVisitId) return visit;
    const rootId = tree.root(visit).id;
    return visit.parentVisitId === rootId
      ? visit
      : { ...visit, parentVisitId: rootId };
  });
}

export function migrateFlatFollowups(
  transaction,
  onError,
  onComplete = () => {},
) {
  const store = transaction.objectStore("visits");
  store.getAll().onsuccess = (event) => {
    try {
      const visits = event.target.result;
      flattenFollowups(visits).forEach((visit, index) => {
        if (visit !== visits[index]) store.put(visit);
      });
      onComplete();
    } catch (error) {
      onError(error);
      transaction.abort();
    }
  };
}

// Keep all previously entered care information when retiring the separate fields.
export function moveVisitFollowupNotes(visit) {
  if (!("followUpInstructions" in visit) && !("followUpDate" in visit))
    return visit;
  const { followUpInstructions, followUpDate, ...record } = visit;
  const notes = [
    record.notes,
    followUpInstructions
      ? `Follow-up instructions: ${followUpInstructions}`
      : "",
    followUpDate ? `Recommended review date: ${followUpDate}` : "",
  ].filter(Boolean);
  if (notes.length) record.notes = notes.join("\n\n");
  return record;
}

export function migrateVisitNotes(transaction, onError) {
  const store = transaction.objectStore("visits");
  store.getAll().onsuccess = (event) => {
    try {
      for (const visit of event.target.result) {
        const migrated = moveVisitFollowupNotes(visit);
        validateRecord("visits", migrated);
        if (migrated !== visit) store.put(migrated);
      }
    } catch (error) {
      onError(error);
      transaction.abort();
    }
  };
}
