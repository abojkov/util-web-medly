import { completeAppointment } from "../db/repository.js";
import { escapeHTML as e } from "../utils/format.js";
import { visitLabel } from "../utils/visits.js";
import { bindFieldSearch } from "./form-fields.js";
import { bindAppointmentVisits } from "./appointment-visits.js";
import {
  showDialog,
  closeDialog,
  requestClose,
  setDialogBusy,
  notify,
} from "./feedback.js";

export function appointmentCompletion(appointment, data, onSaved) {
  const visits = [...data.visits].sort((a, b) => b.date.localeCompare(a.date));
  let dirty = false;
  showDialog(
    "Complete appointment",
    `<form id="appointment-completion-form"><p>Mark <strong>${e(appointment.reason)}</strong> as completed.</p><label class="form-label" for="field-visitId">Medical visit (optional)</label>${visits.length > 8 ? '<input class="form-control selector-search" type="search" placeholder="Find medical visit…" aria-label="Filter medical visits" data-filter-select="field-visitId">' : ""}<select class="form-select" id="field-visitId"><option value="">No linked visit</option>${visits.map((visit) => `<option value="${e(visit.id)}" ${appointment.visitId === visit.id ? "selected" : ""}>${e(visitLabel(visit, data))}</option>`).join("")}</select><p class="form-error" id="completion-error" role="alert"></p><div class="dialog-actions"><button class="btn btn-light" type="button" id="completion-cancel">Cancel</button><button class="btn btn-primary" type="submit">Complete appointment</button></div></form>`,
    {
      onDiscard: () => !dirty || window.confirm("Discard your unsaved changes?"),
    },
  );
  const form = document.querySelector("#appointment-completion-form");
  const visit = form.querySelector("#field-visitId");
  const readVisit = bindAppointmentVisits(form, data, appointment);
  visit.onchange = () => {
    dirty = true;
    form.dataset.dirty = "true";
  };
  bindFieldSearch(form);
  form.querySelector("#completion-cancel").onclick = requestClose;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const visitId = readVisit();
    setDialogBusy(true);
    try {
      const saved = await completeAppointment(appointment.id, visitId);
      dirty = false;
      closeDialog();
      notify("Appointment completed.");
      await onSaved(saved);
    } catch (error) {
      setDialogBusy(false);
      form.querySelector("#completion-error").textContent =
        error.name === "QuotaExceededError"
          ? "Storage is full. Export a backup and free space before retrying."
          : error.message;
    }
  };
}
