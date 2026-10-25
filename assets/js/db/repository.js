import { transaction } from "./database.js";
import { definitions, STORES } from "./schema.js";
import { validateRecord } from "../utils/validation.js";

export async function saveRecord(store, values, original) {
  const now = new Date().toISOString();
  const record = {
    ...original,
    ...values,
    id: original?.id || crypto.randomUUID(),
    createdAt: original?.createdAt || now,
    updatedAt: now,
  };
  validateRecord(store, record);
  // Read relationship targets and write in one transaction to avoid deletion races across tabs.
  await transaction(STORES, "readwrite", (tx) => {
    for (const field of definitions[store].fields.filter(
      (f) => f.type === "reference",
    )) {
      const ids = field.multiple
        ? record[field.key] || []
        : record[field.key]
          ? [record[field.key]]
          : [];
      for (const id of ids)
        tx.objectStore(field.store).get(id).onsuccess = (event) => {
          if (!event.target.result) tx.abort();
        };
    }
    tx.objectStore(store).put(record);
  });
  return record;
}

export async function deleteRecord(store, id) {
  let blocked = false;
  try {
    await transaction(STORES, "readwrite", (tx) => {
      for (const [source, definition] of Object.entries(definitions)) {
        const refs = definition.fields.filter((f) => f.store === store);
        if (!refs.length) continue;
        tx.objectStore(source).getAll().onsuccess = (event) => {
          if (
            event.target.result.some((record) =>
              refs.some((f) =>
                f.multiple ? record[f.key]?.includes(id) : record[f.key] === id,
              ),
            )
          ) {
            blocked = true;
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
    throw error;
  }
}
