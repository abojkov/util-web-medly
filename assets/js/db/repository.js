import { transaction } from "./database.js";
import { definitions, STORES } from "./schema.js";
import { validateRecord } from "../utils/validation.js";
import { validateVisitHierarchy } from "./relationships.js";

const visitCareFields = {
  treatments: "treatmentIds",
  diagnoses: "diagnosisIds",
};

export const medicationKey = (record) =>
  [record.name, record.strength, record.form]
    .map((value) => (value || "").trim().toLocaleLowerCase())
    .join("\u0000");
function stamp(values, original) {
  const now = new Date().toISOString();
  return {
    ...original,
    ...values,
    id: original?.id || values.id || crypto.randomUUID(),
    createdAt: original?.createdAt || now,
    updatedAt: now,
  };
}
export async function saveRecord(store, values, original, related = {}) {
  const record = stamp(values, original);
  const writes = [];
  for (const name of ["medications", "treatments"])
    for (const item of related[name] || [])
      writes.push({ store: name, record: stamp(item) });
  writes.push({ store, record });
  for (const write of writes) validateRecord(write.store, write.record);
  let validationError;
  try {
    await transaction(STORES, "readwrite", (tx) => {
      const stage = () => {
        try {
          const newMedicines = writes.filter(
            (write) =>
              write.store === "medications" &&
              (!original ||
                original.id !== write.record.id ||
                medicationKey(original) !== medicationKey(write.record)),
          );
          if (newMedicines.length)
            tx.objectStore("medications").getAll().onsuccess = (event) => {
              const seen = new Map(
                event.target.result.map((item) => [
                  medicationKey(item),
                  item.id,
                ]),
              );
              for (const { record: medicine } of newMedicines) {
                const key = medicationKey(medicine);
                if (seen.has(key) && seen.get(key) !== medicine.id) {
                  validationError = new Error(
                    "This medicine, strength and form already exist. Select the existing medication from your library.",
                  );
                  tx.abort();
                  return;
                }
                seen.set(key, medicine.id);
              }
            };
          // Stage related records before checking references. A failure rolls back the entire visit.
          for (const write of writes)
            tx.objectStore(write.store).put(write.record);
          if (store === "visits")
            tx.objectStore("visits").getAll().onsuccess = (event) => {
              try {
                validateVisitHierarchy(event.target.result);
              } catch (error) {
                validationError = error;
                tx.abort();
              }
            };
          for (const write of writes)
            for (const field of definitions[write.store].fields.filter(
              (field) => field.type === "reference",
            )) {
              const ids = field.multiple
                ? write.record[field.key] || []
                : write.record[field.key]
                  ? [write.record[field.key]]
                  : [];
              for (const id of ids)
                tx.objectStore(field.store).get(id).onsuccess = (event) => {
                  if (!event.target.result) {
                    validationError = new Error(
                      "A linked record no longer exists. Refresh the archive and choose another record.",
                    );
                    tx.abort();
                  }
                };
            }
          if (visitCareFields[store] && related.visitId) {
            tx.objectStore("visits").get(related.visitId).onsuccess = (
              event,
            ) => {
              try {
                const visit = event.target.result;
                if (!visit)
                  throw new Error(
                    "This visit no longer exists. Refresh the archive before adding this record.",
                  );
                const updated = stamp(
                  {
                    [visitCareFields[store]]: [
                      ...new Set([
                        ...(visit[visitCareFields[store]] || []),
                        record.id,
                      ]),
                    ],
                  },
                  visit,
                );
                validateRecord("visits", updated);
                tx.objectStore("visits").put(updated);
              } catch (error) {
                validationError = error;
                tx.abort();
              }
            };
          }
        } catch (error) {
          validationError = error;
          tx.abort();
        }
      };
      // Clinical edits must retain current care links, including changes from another tab.
      if (
        store === "visits" &&
        original &&
        Object.values(visitCareFields).some(
          (key) => !Object.hasOwn(values, key),
        )
      ) {
        tx.objectStore("visits").get(record.id).onsuccess = (event) => {
          if (!event.target.result) {
            validationError = new Error(
              "This visit no longer exists. Refresh the archive before saving.",
            );
            tx.abort();
            return;
          }
          for (const key of Object.values(visitCareFields))
            if (!Object.hasOwn(values, key))
              record[key] = event.target.result[key] || [];
          stage();
        };
      } else stage();
    });
  } catch (error) {
    throw validationError || error;
  }
  return record;
}

export async function completeAppointment(id, visitId = "") {
  let saved;
  let validationError;
  try {
    await transaction(["appointments", "visits"], "readwrite", (tx) => {
      const appointments = tx.objectStore("appointments");
      const fail = (error) => {
        validationError = error;
        tx.abort();
      };
      appointments.get(id).onsuccess = (event) => {
        try {
          const current = event.target.result;
          if (!current)
            throw new Error("This appointment no longer exists. Refresh the archive.");
          if (current.status !== "Scheduled")
            throw new Error("This appointment is no longer scheduled. Refresh the archive.");
          saved = stamp({ status: "Completed", visitId }, current);
          validateRecord("appointments", saved);
          if (!visitId) appointments.put(saved);
          else
            tx.objectStore("visits").get(visitId).onsuccess = (visit) => {
              try {
                if (!visit.target.result)
                  throw new Error("This medical visit no longer exists. Choose another visit or leave it unlinked.");
                appointments.put(saved);
              } catch (error) {
                fail(error);
              }
            };
        } catch (error) {
          fail(error);
        }
      };
    });
  } catch (error) {
    throw validationError || error;
  }
  return saved;
}

export async function combineMedications(sourceId, targetId) {
  if (sourceId === targetId)
    throw new Error("Choose a different medication to keep.");
  let validationError;
  try {
    await transaction(["medications", "treatments"], "readwrite", (tx) => {
      const medicines = tx.objectStore("medications");
      medicines.getAll().onsuccess = (event) => {
        try {
          const source = event.target.result.find(
            (record) => record.id === sourceId,
          );
          const target = event.target.result.find(
            (record) => record.id === targetId,
          );
          if (!source || !target)
            throw new Error(
              "One of these medications no longer exists. Refresh and try again.",
            );
          const details = [
            source.name,
            source.strength,
            source.form,
            source.notes,
          ]
            .filter(Boolean)
            .join(" · ");
          const updated = stamp(
            {
              ...target,
              notes: [target.notes, `Combined library entry: ${details}`]
                .filter(Boolean)
                .join("\n\n"),
            },
            target,
          );
          validateRecord("medications", updated);
          medicines.put(updated);
          tx.objectStore("treatments").getAll().onsuccess = (event) => {
            for (const course of event.target.result)
              if (course.medicationId === sourceId)
                tx.objectStore("treatments").put({
                  ...course,
                  medicationId: targetId,
                  updatedAt: updated.updatedAt,
                });
          };
          medicines.delete(sourceId);
        } catch (error) {
          validationError = error;
          tx.abort();
        }
      };
    });
  } catch (error) {
    throw validationError || error;
  }
}
export async function deleteRecord(store, id) {
  let blocked = false;
  let validationError;
  try {
    await transaction(STORES, "readwrite", (tx) => {
      for (const [source, definition] of Object.entries(definitions)) {
        const refs = definition.fields.filter((field) => field.store === store);
        if (!refs.length) continue;
        tx.objectStore(source).getAll().onsuccess = (event) => {
          try {
            for (const record of event.target.result) {
              const changes = {};
              for (const field of refs) {
                const linked = field.multiple
                  ? record[field.key]?.includes(id)
                  : record[field.key] === id;
                if (!linked) continue;
                const mayUnlink =
                  (source === "visits" &&
                    field.key === visitCareFields[store]) ||
                  (store === "diagnoses" &&
                    source === "treatments" &&
                    field.key === "diagnosisId");
                if (!mayUnlink) {
                  blocked = true;
                  tx.abort();
                  return;
                }
                changes[field.key] = field.multiple
                  ? record[field.key].filter((linkedId) => linkedId !== id)
                  : "";
              }
              if (!Object.keys(changes).length) continue;
              const updated = stamp(changes, record);
              validateRecord(source, updated);
              tx.objectStore(source).put(updated);
            }
          } catch (error) {
            validationError = error;
            tx.abort();
          }
        };
      }
      tx.objectStore(store).delete(id);
    });
  } catch (error) {
    if (blocked)
      throw new Error(
        "This record is linked to other records. Remove those links before deleting it. Your history has been preserved.",
      );
    throw validationError || error;
  }
}
