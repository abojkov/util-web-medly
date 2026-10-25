import { definitions, FILE_TYPES } from "../db/schema.js";
import { saveRecord } from "../db/repository.js";
import { validateFile } from "../utils/validation.js";
import {
  escapeHTML as e,
  titleFor,
  localDateTime,
  today,
} from "../utils/format.js";
import {
  showDialog,
  closeDialog,
  requestClose,
  setDialogBusy,
  notify,
} from "./feedback.js";

export function recordForm(store, data, original, onSaved, defaults = {}) {
  const definition = definitions[store];
  const values = original || {
    date: store === "diagnoses" ? today() : localDateTime(),
    startDate: today(),
    ...defaults,
  };
  const fields = definition.fields
    .map((field) => {
      const value = values[field.key] ?? "";
      const id = `field-${field.key}`;
      let input;
      const common = `id="${id}" name="${field.key}" ${field.required ? "required" : ""}`;
      if (field.type === "textarea")
        input = `<textarea class="form-control" ${common} rows="3" maxlength="20000">${e(value)}</textarea>`;
      else if (field.type === "select" || field.type === "reference") {
        const options = field.options
          ? field.options.map((option) => ({ id: option, title: option }))
          : [...data[field.store]]
              .sort((a, b) =>
                titleFor(field.store, a).localeCompare(
                  titleFor(field.store, b),
                ),
              )
              .map((record) => ({
                id: record.id,
                title: titleFor(field.store, record),
              }));
        input = `${field.type === "reference" && options.length > 8 ? `<input class="form-control selector-search" type="search" placeholder="Find ${e(field.label.toLowerCase())}…" aria-label="Filter ${e(field.label.toLowerCase())}" data-filter-select="${id}">` : ""}<select class="form-select" ${common} ${field.multiple ? 'multiple size="4"' : ""}>${!field.multiple && field.type === "reference" ? '<option value="">Not linked</option>' : ""}${options.map((option) => `<option value="${e(option.id)}" ${(field.multiple ? value.includes?.(option.id) : value === option.id) ? "selected" : ""}>${e(option.title)}</option>`).join("")}</select>`;
        if (field.multiple)
          input +=
            '<small class="form-text">Choose any that apply. On desktop, hold Ctrl or ⌘ to select several.</small>';
        if (field.type === "reference" && !options.length)
          input += `<small class="form-text">Add ${e(definitions[field.store].label.toLowerCase())} in their section first. You can link them later.</small>`;
      } else
        input = `<input class="form-control" ${common} type="${field.type}" value="${e(value)}" ${!["date", "datetime-local"].includes(field.type) ? 'maxlength="20000"' : ""}>`;
      return `<div class="${field.type === "textarea" || field.multiple ? "col-12" : "col-md-6"}"><label class="form-label" for="${id}">${e(field.label)}${field.required ? ' <span aria-label="required">*</span>' : ""}</label>${input}</div>`;
    })
    .join("");
  showDialog(
    `${original ? "Edit" : "Add"} ${definition.singular.toLowerCase()}`,
    `<form id="record-form"><p class="form-text mb-4">A little detail now makes your history easier to understand later. * Required</p><div class="row g-3">${fields}${store === "documents" && !original ? `<div class="col-12"><label class="form-label" for="document-file">Medical file *</label><input class="form-control" id="document-file" name="file" type="file" accept="${FILE_TYPES.join(",")}" required><small class="form-text">PDF, JPEG, PNG, or WebP · maximum 7 MB. Add each document separately.</small></div>` : ""}</div><p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn btn-light" id="form-cancel">Cancel</button><button type="submit" class="btn btn-primary">Save ${e(definition.singular.toLowerCase())}</button></div></form>`,
    {
      onDiscard: () =>
        !dirty || window.confirm("Discard your unsaved changes?"),
    },
  );
  const form = document.querySelector("#record-form");
  let dirty = false;
  form.addEventListener("input", () => {
    dirty = true;
    form.dataset.dirty = "true";
  });
  form.addEventListener("change", () => {
    dirty = true;
    form.dataset.dirty = "true";
  });
  form.querySelector("#form-cancel").onclick = requestClose;
  form.querySelectorAll("[data-filter-select]").forEach(
    (input) =>
      (input.oninput = () => {
        const select = document.getElementById(input.dataset.filterSelect);
        for (const option of select.options)
          option.hidden =
            !option.selected &&
            !option.textContent
              .toLowerCase()
              .includes(input.value.toLowerCase());
      }),
  );
  const fileInput = form.querySelector('[name="file"]');
  if (fileInput) {
    form.querySelector('[name="name"]').required = false;
    fileInput.onchange = () => {
      if (!form.elements.name.value && fileInput.files[0])
        form.elements.name.value = fileInput.files[0].name;
    };
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(
      definition.fields.map((field) => [
        field.key,
        field.multiple
          ? [...form.elements[field.key].selectedOptions].map(
              (option) => option.value,
            )
          : form.elements[field.key].value.trim(),
      ]),
    );
    const file = fileInput?.files[0];
    setDialogBusy(true);
    try {
      if (file) {
        await validateFile(file);
        Object.assign(values, {
          blob: file,
          type: file.type,
          size: file.size,
          name: values.name || file.name,
        });
      }
      const saved = await saveRecord(store, values, original);
      dirty = false;
      closeDialog();
      notify(`${definition.singular} saved.`);
      await onSaved(saved);
    } catch (error) {
      setDialogBusy(false);
      form.querySelector("#form-error").textContent =
        error.name === "QuotaExceededError"
          ? "Storage is full. Export a backup and free space before retrying."
          : error.message;
    }
  };
}
