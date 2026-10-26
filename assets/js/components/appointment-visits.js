import { dateLabel } from "../utils/format.js";
import { visitLabel } from "../utils/visits.js";

export function bindAppointmentVisits(form, data, appointment) {
  const select = form.querySelector("#field-visitId");
  const date = form.querySelector("#field-date");
  const search = form.querySelector('[data-filter-select="field-visitId"]');
  const hint = document.createElement("small");
  hint.className = "form-text";
  hint.id = "appointment-visit-hint";
  select.setAttribute("aria-describedby", hint.id);
  hint.setAttribute("aria-live", "polite");
  select.after(hint);
  const current = data.visits.find((visit) => visit.id === appointment.visitId);
  const read = () => select.value === "__keep__" ? current.id : select.value;
  let day;
  let visits = [];
  const updateHint = () => {
    hint.textContent = select.value === "__keep__"
      ? `Current linked visit: ${visitLabel(current, data)}. Kept unless you change this selection.`
      : visits.length
        ? `Medical visits on ${dateLabel(day)} only. Linking a visit is optional.`
        : day
          ? "No medical visits on this date. You can leave this appointment unlinked."
          : "Choose an appointment date to see medical visits on that day.";
  };
  const update = () => {
    const selected = read() || "";
    day = (date ? date.value : appointment.date || "").slice(0, 10);
    visits = data.visits
      .filter((visit) => day && visit.date.slice(0, 10) === day)
      .sort((a, b) => b.date.localeCompare(a.date));
    select.replaceChildren(new Option("No linked visit", ""));
    for (const visit of visits)
      select.add(new Option(visitLabel(visit, data), visit.id));
    if (visits.some((visit) => visit.id === selected)) select.value = selected;
    else if (current && selected === current.id) {
      // Retain historical links without offering a different-day visit as a choice.
      select.add(new Option("Keep current link", "__keep__"));
      select.value = "__keep__";
    }
    if (search) {
      search.hidden = visits.length <= 8;
      search.value = "";
    }
    updateHint();
  };
  select.value = appointment.visitId || "";
  if (date) {
    date.addEventListener("input", update);
    date.addEventListener("change", update);
  }
  select.addEventListener("change", updateHint);
  update();
  return read;
}
