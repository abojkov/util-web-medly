import { dateLabel } from "./format.js";

export function visitHierarchy(visits) {
  const byId = new Map(visits.map((visit) => [visit.id, visit]));
  const children = new Map();
  for (const visit of visits)
    if (visit.parentVisitId) {
      if (!children.has(visit.parentVisitId))
        children.set(visit.parentVisitId, []);
      children.get(visit.parentVisitId).push(visit);
    }
  for (const records of children.values())
    records.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
  function root(visit) {
    const seen = new Set();
    while (
      visit?.parentVisitId &&
      byId.has(visit.parentVisitId) &&
      !seen.has(visit.id)
    ) {
      seen.add(visit.id);
      visit = byId.get(visit.parentVisitId);
    }
    return visit;
  }
  function descendants(id) {
    const result = [];
    const stack = [...(children.get(id) || [])].reverse();
    const seen = new Set([id]);
    while (stack.length) {
      const visit = stack.pop();
      if (seen.has(visit.id)) continue;
      seen.add(visit.id);
      result.push(visit);
      stack.push(...[...(children.get(visit.id) || [])].reverse());
    }
    return result;
  }
  return { byId, children, root, descendants };
}
export function visitLabel(visit, data) {
  const doctor = data.doctors.find((doctor) => doctor.id === visit.doctorId);
  return [
    visit.reason,
    dateLabel(visit.date, { hour: "2-digit", minute: "2-digit" }),
    doctor?.name,
  ]
    .filter(Boolean)
    .join(" · ");
}
