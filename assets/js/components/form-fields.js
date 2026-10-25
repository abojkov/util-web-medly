import { definitions } from "../db/schema.js";
import { escapeHTML as e, titleFor } from "../utils/format.js";
import {
  medicineChoiceLabel,
  newestCourses,
  courseLabel,
} from "../utils/care.js";
import { visitLabel } from "../utils/visits.js";
export function formFields(store, data, values = {}, prefix = "field-") {
  return definitions[store].fields
    .filter(
      (field) =>
        field.key !== "parentVisitId" &&
        !(
          store === "visits" &&
          ["treatmentIds", "diagnosisIds"].includes(field.key)
        ),
    )
    .map((field) => {
      const value = values[field.key] ?? "";
      const id = `${prefix}${field.key}`;
      const common = `id="${id}" name="${id}" ${field.required ? "required" : ""}`;
      let input;
      if (field.type === "textarea")
        input = `<textarea class="form-control" ${common} rows="3" maxlength="${field.maxLength || 20000}">${e(value)}</textarea>`;
      else if (["select", "reference"].includes(field.type)) {
        let records =
          field.store === "treatments"
            ? newestCourses(data.treatments)
            : [...(data[field.store] || [])].sort((a, b) =>
                titleFor(field.store, a).localeCompare(
                  titleFor(field.store, b),
                ),
              );
        const options = field.options
          ? field.options.map((option) => ({ id: option, title: option }))
          : records.map((record) => ({
              id: record.id,
              title:
                field.store === "treatments"
                  ? courseLabel(record, data)
                  : field.store === "medications"
                    ? medicineChoiceLabel(record, data)
                    : field.store === "visits"
                      ? visitLabel(record, data)
                      : titleFor(field.store, record),
            }));
        input = `${field.type === "reference" && options.length > 8 ? `<input class="form-control selector-search" type="search" placeholder="Find ${e(field.label.toLowerCase())}…" aria-label="Filter ${e(field.label.toLowerCase())}" data-filter-select="${id}">` : ""}<select class="form-select" ${common} ${field.multiple ? 'multiple size="4"' : ""}>${!field.multiple && field.type === "reference" ? `<option value="">${field.key === "medicationId" ? "No medication (non-medication care)" : "Not linked"}</option>` : ""}${options.map((option) => `<option value="${e(option.id)}" ${(field.multiple ? value.includes?.(option.id) : value === option.id) ? "selected" : ""}>${e(option.title)}</option>`).join("")}${field.key === "medicationId" ? '<option value="__new__">+ Add a new medicine to the library</option>' : ""}</select>`;
        if (field.multiple)
          input +=
            '<small class="form-text">Choose any that apply. On desktop, hold Ctrl or ⌘ to select several.</small>';
        if (
          field.type === "reference" &&
          !options.length &&
          ![
            "medicationId",
            "parentVisitId",
            ...(store === "treatments" ? ["diagnosisId"] : []),
          ].includes(field.key)
        )
          input +=
            '<small class="form-text">You can add and link these later.</small>';
      } else
        input = `<input class="form-control" ${common} type="${field.type}" value="${e(value)}" ${!["date", "datetime-local"].includes(field.type) ? 'maxlength="20000"' : ""}>`;
      return `<div class="${field.type === "textarea" || field.multiple ? "col-12" : "col-md-6"}"><label class="form-label" for="${id}">${e(field.label)}${field.required ? ' <span aria-label="required">*</span>' : ""}</label>${input}</div>`;
    })
    .join("");
}
export function readFields(store, root, prefix = "field-") {
  return Object.fromEntries(
    definitions[store].fields
      .filter(
        (field) =>
          field.key !== "parentVisitId" &&
          !(
            store === "visits" &&
            ["treatmentIds", "diagnosisIds"].includes(field.key)
          ),
      )
      .map((field) => {
        const input = root.querySelector(`#${prefix}${field.key}`);
        return [
          field.key,
          field.multiple
            ? [...input.selectedOptions].map((option) => option.value)
            : input.value.trim(),
        ];
      }),
  );
}
export function bindFieldSearch(root) {
  root.querySelectorAll("[data-filter-select]").forEach(
    (input) =>
      (input.oninput = () => {
        const select = root.querySelector(`#${input.dataset.filterSelect}`);
        for (const option of select.options)
          option.hidden =
            !option.selected &&
            !option.textContent
              .toLowerCase()
              .includes(input.value.toLowerCase());
      }),
  );
}
