import { escapeHTML as e, dateLabel } from "../utils/format.js";
import { visitHierarchy, visitLabel } from "../utils/visits.js";
import { icon } from "../components/icons.js";

function followUpCard(visit, data, { currentId, matches }) {
  const doctor = data.doctors.find((doctor) => doctor.id === visit.doctorId);
  const clinic =
    !doctor && data.clinics.find((clinic) => clinic.id === visit.clinicId);
  const fields = [
    ["Visit reason & symptoms", visit.reasonAndSymptoms],
    ["Tests & procedures", visit.procedures],
    ["Clinical findings", visit.findings],
    ["Notes", visit.notes],
  ];
  const diagnoses = data.diagnoses.filter((diagnosis) =>
    visit.diagnosisIds?.includes(diagnosis.id),
  );
  const courses = data.treatments.filter((course) =>
    visit.treatmentIds?.includes(course.id),
  );
  const documents = data.documents.filter(
    (document) => document.visitId === visit.id,
  );
  return `<div class="followup-card"><article class="followup-node ${visit.id === currentId ? "current-visit" : ""}"><header class="followup-header"><span class="followup-title"><strong>${e(visit.title)}</strong><time datetime="${e(visit.date)}">${e(dateLabel(visit.date, { hour: "2-digit", minute: "2-digit" }))}</time>${doctor || clinic ? `<span>${e((doctor || clinic).name)}</span>` : ""}</span>${matches?.has(visit.id) ? '<span class="status status-green">Matches filters</span>' : ""}</header><div class="followup-content"><dl class="followup-facts">${fields
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`,
    )
    .join(
      "",
    )}</dl>${diagnoses.length ? `<h4>Diagnoses</h4><div>${diagnoses.map((diagnosis) => `<a class="linked-chip" href="#/diagnoses/${diagnosis.id}">${e(diagnosis.name)}</a>`).join("")}</div>` : ""}${courses.length ? `<h4>Treatments & prescriptions</h4>${courses.map((course) => `<div class="episode-course"><a class="text-link" href="#/treatments/${course.id}">${e(course.name)}</a><p>${e([course.dosage, course.frequency, course.status, course.startDate ? dateLabel(course.startDate) : "Start date unknown", course.endDate ? `until ${dateLabel(course.endDate)}` : ""].filter(Boolean).join(" · "))}</p>${course.instructions ? `<p class="episode-instructions">${e(course.instructions)}</p>` : ""}</div>`).join("")}` : ""}${documents.length ? `<h4>Documents</h4><div>${documents.map((document) => `<a class="linked-chip" href="#/documents/${document.id}">${e(document.name)}</a>`).join("")}</div>` : ""}</div></article><div class="followup-actions"><a class="icon-button" href="#/visits/${visit.id}" aria-label="Open visit: ${e(visit.title)}" title="Open visit">${icon("open")}</a><button class="icon-button" data-edit="${visit.id}" data-store="visits" aria-label="Edit visit: ${e(visit.title)}" title="Edit visit">${icon("edit")}</button></div></div>`;
}

export function followUpTree(parentId, data, tree, options = {}) {
  return `<ol class="followup-tree">${(tree.children.get(parentId) || []).map((visit) => `<li>${followUpCard(visit, data, options)}</li>`).join("")}</ol>`;
}

export function episodeSection(visit, data) {
  const tree = visitHierarchy(data.visits);
  const root = tree.root(visit);
  const count = tree.descendants(root.id).length;
  return `<section class="panel episode-section mt-4"><div class="panel-heading"><div><h2>Follow-ups in this episode${count ? ` · ${count}` : ""}</h2></div>${!visit.parentVisitId ? `<button class="btn btn-outline-primary btn-sm" data-followup="${root.id}">${icon("plus")} Add follow-up</button>` : ""}</div>${visit.parentVisitId ? `<p class="episode-origin">Initial visit: <a href="#/visits/${root.id}">${e(visitLabel(root, data))}</a></p>` : ""}${count ? followUpTree(root.id, data, tree, { currentId: visit.id }) : '<p class="episode-empty">No follow-ups recorded yet. Add a completed follow-up from this initial visit.</p>'}</section>`;
}

export function episodeListRow(root, data, tree, matchingIds, filtered) {
  const descendants = tree.descendants(root.id);
  const latest = [...descendants].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];
  const matches = filtered
    ? new Set(
        descendants
          .filter((visit) => matchingIds.has(visit.id))
          .map((visit) => visit.id),
      )
    : undefined;
  return `<a class="record-row episode-list-group" data-episode="${root.id}" href="#/visits/${root.id}"><span class="record-icon tone-visits">${icon("visit")}</span><span class="episode-list-title"><strong>${e(root.title)}</strong><span>Initial visit · ${e(dateLabel(root.date))}</span><span>Latest follow-up: ${e(latest.title)} · ${e(dateLabel(latest.date, { hour: "2-digit", minute: "2-digit" }))}</span>${matches?.size ? `<span class="episode-match">${matches.size} matching ${matches.size === 1 ? "follow-up" : "follow-ups"}</span>` : ""}</span><span class="episode-count">${descendants.length} ${descendants.length === 1 ? "follow-up" : "follow-ups"}</span>${icon("arrow")}</a>`;
}
