import { STORES, definitions } from "./schema.js";

export function validateRelationships(
  data,
  entityDefinitions = definitions,
  options = {},
) {
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
  if (
    entityDefinitions.visits.fields.some(
      (field) => field.key === "parentVisitId",
    )
  )
    validateVisitHierarchy(data.visits, options);
}

export function validateVisitHierarchy(visits, { allowNested = false } = {}) {
  const byId = new Map(visits.map((visit) => [visit.id, visit]));
  const checked = new Set();
  for (const start of visits) {
    const path = new Set();
    let visit = start;
    while (visit && !checked.has(visit.id)) {
      if (path.has(visit.id))
        throw new Error(
          "Follow-up links cannot form a circle. Choose a visit outside this visit’s follow-ups.",
        );
      path.add(visit.id);
      if (!visit.parentVisitId) break;
      const parent = byId.get(visit.parentVisitId);
      if (!parent)
        throw new Error(
          "The original visit no longer exists. Choose another visit or start a new episode.",
        );
      visit = parent;
    }
    for (const id of path) checked.add(id);
  }
  if (
    !allowNested &&
    visits.some(
      (visit) =>
        visit.parentVisitId && byId.get(visit.parentVisitId)?.parentVisitId,
    )
  ) {
    throw new Error(
      "A follow-up can only link to an initial visit. A visit with follow-ups cannot itself become a follow-up; reassign or unlink its follow-ups first.",
    );
  }
}
