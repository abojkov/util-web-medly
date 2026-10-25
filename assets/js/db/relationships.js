import { STORES, definitions } from "./schema.js";

export function validateRelationships(data, entityDefinitions = definitions) {
  const ids = Object.fromEntries(
    STORES.map((store) => [
      store,
      new Set(data[store].map((record) => record.id)),
    ]),
  );
  for (const store of STORES)
    for (const record of data[store]) {
      for (const field of entityDefinitions[store].fields.filter(
        (field) => field.type === "reference",
      )) {
        const references = field.multiple
          ? record[field.key] || []
          : record[field.key]
            ? [record[field.key]]
            : [];
        if (references.some((id) => !ids[field.store].has(id)))
          throw new Error(
            "A record refers to a missing record. The archive cannot be saved safely.",
          );
      }
    }
}
