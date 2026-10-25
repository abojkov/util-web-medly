import { definitions, FILE_TYPES } from "../db/schema.js";
import { saveRecord } from "../db/repository.js";
import { validateFile } from "../utils/validation.js";
import { escapeHTML as e, localDateTime, today } from "../utils/format.js";
import { formFields, readFields, bindFieldSearch } from "./form-fields.js";
import { treatmentEditor } from "./treatment-editor.js";
import {
  showDialog,
  closeDialog,
  requestClose,
  setDialogBusy,
  notify,
} from "./feedback.js";

export function recordForm(store, data, original, onSaved, defaults = {}) {
  const definition = definitions[store];
  const parentVisitId =
    store === "visits"
      ? original
        ? original.parentVisitId || ""
        : defaults.parentVisitId || ""
      : "";
  const recordLabel = parentVisitId
    ? "follow-up visit"
    : definition.singular.toLowerCase();
  const values = original || {
    date: store === "diagnoses" ? today() : localDateTime(),
    startDate: today(),
    ...defaults,
  };
  let dirty = false;
  showDialog(
    `${original ? "Edit" : "Add"} ${recordLabel}`,
    `<form id="record-form"><p class="form-text mb-4">${store === "medications" ? "Add a medicine once. Dates, dosage, and prescription instructions belong to each treatment course." : store === "treatments" ? "* Required. Save a separate course for each episode of care." : "* Required. Optional details can be added later."}</p><div id="primary-fields">${store === "treatments" ? "" : `<div class="row g-3">${formFields(store, data, values)}</div>`}</div>${store === "documents" && !original ? `<div class="mt-3"><label class="form-label" for="document-file">Medical file *</label><input class="form-control" id="document-file" name="file" type="file" accept="${FILE_TYPES.join(",")}" required><small class="form-text">PDF, JPEG, PNG, or WebP · maximum 7 MB. Add each document separately.</small></div>` : ""}<p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn btn-light" id="form-cancel">Cancel</button><button type="submit" class="btn btn-primary">Save ${e(recordLabel)}</button></div></form>`,
    {
      onDiscard: () =>
        !dirty || window.confirm("Discard your unsaved changes?"),
    },
  );
  const form = document.querySelector("#record-form");
  const markDirty = () => {
    dirty = true;
    form.dataset.dirty = "true";
  };
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);
  form.querySelector("#form-cancel").onclick = requestClose;
  bindFieldSearch(form);
  let editor;
  if (store === "treatments")
    editor = treatmentEditor(
      form.querySelector("#primary-fields"),
      data,
      values,
      "field-",
      markDirty,
    );
  const fileInput = form.querySelector('[name="file"]');
  if (fileInput) {
    form.querySelector("#field-name").required = false;
    fileInput.onchange = () => {
      const name = form.querySelector("#field-name");
      if (!name.value && fileInput.files[0])
        name.value = fileInput.files[0].name;
    };
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      let values;
      const related = { medications: [] };
      if (
        ["treatments", "diagnoses"].includes(store) &&
        !original &&
        defaults.visitId
      )
        related.visitId = defaults.visitId;
      if (store === "treatments") {
        const draft = editor.read();
        editor.validate(draft);
        values = draft.course;
        if (draft.medicine) related.medications.push(draft.medicine);
      } else values = readFields(store, form);
      if (store === "visits") values.parentVisitId = parentVisitId;
      const file = fileInput?.files[0];
      setDialogBusy(true);
      if (file) {
        await validateFile(file);
        Object.assign(values, {
          blob: file,
          type: file.type,
          size: file.size,
          name: values.name || file.name,
        });
      }
      const saved = await saveRecord(store, values, original, related);
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
