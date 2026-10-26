import { definitions } from "../db/schema.js";
import { events, upcoming } from "../services/history.js";
import { dateLabel, escapeHTML as e } from "../utils/format.js";
import { icon } from "../components/icons.js";
import { addButton, emptyState, pageHeader, recordRow } from "./shared.js";

export function dashboard(data) {
  const hasRecords = Object.values(data).some((records) => records.length);
  const future = upcoming(data);
  const stats = [
    ["visits", data.visits.length, "Medical visits", "Your care history"],
    ["diagnoses", data.diagnoses.length, "Diagnoses", "The bigger picture"],
    [
      "treatments",
      data.treatments.filter((t) => t.status === "Active").length,
      "Active treatments",
      "Care in progress",
    ],
    [
      "appointments",
      data.appointments.filter(
        (a) =>
          a.status === "Scheduled" &&
          a.date >=
            new Date().toLocaleString("sv").slice(0, 16).replace(" ", "T"),
      ).length,
      "Upcoming appointments",
      "Looking ahead",
    ],
    ["documents", data.documents.length, "Documents", "Safely organized"],
  ];
  return `${pageHeader(dateLabel(new Date().toISOString(), { weekday: "long" }), "Your health, together.", "A calmer place to keep your whole health story.", addButton("visits"))}
    ${!hasRecords ? `<section class="welcome-card"><div class="welcome-copy"><span class="pill">A FRESH START</span><h2>Every health story<br>starts somewhere.</h2><p>Bring your visits, care plans and medical documents into one personal space. Start with your first visit - we’ll keep things organized from there.</p>${addButton("visits", "Add your first visit")}<span class="welcome-footnote">${icon("shield")} No account. No cloud. Just you.</span></div><div class="welcome-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-paper"><span class="art-cross">✚</span><span class="art-line"></span><span class="art-line short"></span><svg viewBox="0 0 180 70"><path d="M0 40h40l10-13 16 32 18-47 17 38 10-10h69" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg><span class="art-line"></span><span class="art-line short"></span></div><span class="art-check">✓</span><span class="art-leaf">✦</span></div></section>` : ""}
    <section class="stats-grid" aria-label="Health summary">${stats.map(([store, count, title, subtitle]) => `<a class="stat-card" href="#/${store}"><span class="stat-icon tone-${store}">${icon(definitions[store].icon)}</span><span class="stat-number">${count}</span><strong>${title}</strong><small>${subtitle}</small></a>`).join("")}</section>
    <div class="dashboard-columns"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">YOUR STORY SO FAR</p><h2>Recent activity</h2></div><a class="text-link" href="#/timeline">View timeline ${icon("arrow")}</a></div>${
      hasRecords && events(data).length
        ? `<div class="record-list">${events(data)
            .slice(0, 5)
            .map((event) =>
              recordRow(event.store, event.record, data, event.label),
            )
            .join("")}</div>`
        : emptyState(
            "timeline",
            "Your story is ready to begin",
            "Once you add a visit, diagnosis or document, you’ll see it here.",
          )
    }</section>
    <section class="panel"><div class="panel-heading"><div><p class="eyebrow">A LITTLE LOOK AHEAD</p><h2>Coming up</h2></div><a class="icon-button" href="#/appointments" aria-label="View appointments">${icon("arrow")}</a></div>${
      future.length
        ? `<div class="upcoming-list">${future
            .slice(0, 4)
            .map(
              (event) =>
                `<a class="upcoming-item" href="#/${event.store}/${event.record.id}"><span class="date-tile"><small>${e(dateLabel(event.date, { month: "short", day: undefined, year: undefined }))}</small><strong>${e(dateLabel(event.date, { day: "numeric", month: undefined, year: undefined }))}</strong></span><div><strong>${e(event.title)}</strong><span>${e(event.label)}</span></div></a>`,
            )
            .join("")}</div>`
        : emptyState(
            "calendar",
            "A little breathing room",
            "No appointments or follow-ups on your calendar.",
            `<button class="btn btn-outline-primary btn-sm" data-add="appointments">Plan an appointment</button>`,
          )
    }</section></div>
    <section class="quick-section"><div class="section-title"><h2>Make a little room for your health</h2><span>What would you like to add?</span></div><div class="quick-grid">${["diagnoses", "treatments", "doctors", "documents"].map((store) => `<button class="quick-action" data-add="${store}"><span class="record-icon tone-${store}">${icon(definitions[store].icon)}</span><span>Add ${definitions[store].singular.toLowerCase()}</span>${icon("plus")}</button>`).join("")}</div></section>
    <div class="privacy-note">${icon("shield")}<div><strong>Private by design. Yours by default.</strong><p>Your records are stored in this browser on this device. Keep a backup to protect your history.</p></div><a href="#/settings" class="text-link">Manage backups ${icon("arrow")}</a></div>`;
}
