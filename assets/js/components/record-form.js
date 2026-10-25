import { definitions, FILE_TYPES } from "../db/schema.js";
import { saveRecord } from "../db/repository.js";
import { validateFile } from "../utils/validation.js";
import { escapeHTML as e, localDateTime, today } from "../utils/format.js";
import { courseLabel } from "../utils/care.js";
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
  const values = original || {
    date: store === "diagnoses" ? today() : localDateTime(),
    startDate: today(),
    ...defaults,
  };
  let dirty = false;
  showDialog(
    `${original ? "Edit" : "Add"} ${definition.singular.toLowerCase()}`,
    `<form id="record-form"><p class="form-text mb-4">${store === "medications" ? "Add a medicine once. Dates, dosage, and prescription instructions belong to each treatment course." : store === "visits" || store === "treatments" ? "* Required. Save a separate course for each episode of care." : "* Required. Optional details can be added later."}</p><div id="primary-fields">${store === "treatments" ? "" : `<div class="row g-3">${formFields(store, data, values)}</div>`}</div>${store === "visits" ? '<section class="visit-treatment-section mt-4"><h3>Treatments for this visit</h3><p class="form-text">Add a new course, choose a library medicine, or reuse previous details. Everything saves together with the visit.</p><div id="pending-treatments"></div><button type="button" class="btn btn-outline-primary" id="new-visit-treatment">Add treatment</button><fieldset id="treatment-draft" class="treatment-draft mt-3" hidden disabled><div id="treatment-editor"></div><p id="course-error" class="form-error" role="alert"></p><div class="action-group mt-3"><button type="button" class="btn btn-outline-primary" id="queue-treatment">Add to visit</button><button type="button" class="btn btn-light" id="cancel-treatment">Cancel treatment</button></div></fieldset></section>' : ""}${store === "documents" && !original ? `<div class="mt-3"><label class="form-label" for="document-file">Medical file *</label><input class="form-control" id="document-file" name="file" type="file" accept="${FILE_TYPES.join(",")}" required><small class="form-text">PDF, JPEG, PNG, or WebP · maximum 7 MB. Add each document separately.</small></div>` : ""}<p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn btn-light" id="form-cancel">Cancel</button><button type="submit" class="btn btn-primary">Save ${e(definition.singular.toLowerCase())}</button></div></form>`,
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
  const stagedCourses = [];
  const stagedMedicines = [];
  let editor;
  if (store === "treatments")
    editor = treatmentEditor(
      form.querySelector("#primary-fields"),
      data,
      values,
      "field-",
      markDirty,
    );
  if (store === "visits") {
    const fieldset = form.querySelector("#treatment-draft");
    let editingCourseId;
    const hideEditor = () => {
      fieldset.hidden = true;
      fieldset.disabled = true;
      form.querySelector("#new-visit-treatment").hidden = false;
      form.querySelectorAll("#pending-treatments button").forEach((button) => {
        button.disabled = false;
      });
      editingCourseId = undefined;
    };
    const openEditor = (course) => {
      const workingData = {
        ...data,
        medications: [...data.medications, ...stagedMedicines],
      };
      editor = treatmentEditor(
        form.querySelector("#treatment-editor"),
        workingData,
        {
          startDate:
            form.querySelector("#field-date").value.slice(0, 10) || today(),
          doctorId: form.querySelector("#field-doctorId").value,
          ...course,
        },
        "course-",
        markDirty,
      );
      fieldset.hidden = false;
      fieldset.disabled = false;
      form.querySelector("#new-visit-treatment").hidden = true;
      editingCourseId = course?.id;
      form.querySelector("#course-error").textContent = "";
      form.querySelectorAll("#pending-treatments button").forEach((button) => {
        button.disabled = true;
      });
      markDirty();
      fieldset.querySelector("input")?.focus();
    };
    form.querySelector("#new-visit-treatment").onclick = () => openEditor();
    form.querySelector("#cancel-treatment").onclick = () => {
      if (window.confirm("Discard this treatment draft?")) hideEditor();
    };
    const renderPending = () => {
      form.querySelector("#pending-treatments").innerHTML = stagedCourses
        .map(
          (course) =>
            `<div class="pending-course"><span>${e(courseLabel(course, data))}</span><button type="button" class="btn btn-light" data-edit-course="${course.id}" aria-label="Edit ${e(course.name)} in draft">Edit</button><button type="button" class="btn btn-light" data-remove-course="${course.id}" aria-label="Remove ${e(course.name)} from draft">Remove</button></div>`,
        )
        .join("");
      form.querySelectorAll("[data-edit-course]").forEach((button) => {
        button.onclick = () =>
          openEditor(
            stagedCourses.find(
              (course) => course.id === button.dataset.editCourse,
            ),
          );
      });
      form.querySelectorAll("[data-remove-course]").forEach(
        (button) =>
          (button.onclick = () => {
            stagedCourses.splice(
              stagedCourses.findIndex(
                (course) => course.id === button.dataset.removeCourse,
              ),
              1,
            );
            renderPending();
            markDirty();
          }),
      );
    };
    const queue = () => {
      const draft = editor.read();
      editor.validate(draft);
      if (draft.medicine) stagedMedicines.push(draft.medicine);
      const course = {
        ...draft.course,
        id: editingCourseId || crypto.randomUUID(),
      };
      if (editingCourseId)
        stagedCourses[
          stagedCourses.findIndex((course) => course.id === editingCourseId)
        ] = course;
      else stagedCourses.push(course);
      hideEditor();
      renderPending();
      markDirty();
    };
    form.querySelector("#queue-treatment").onclick = () => {
      try {
        queue();
      } catch (error) {
        form.querySelector("#course-error").textContent = error.message;
      }
    };
    form.queueOpenCourse = () => {
      if (!fieldset.hidden) queue();
    };
    if (defaults.openTreatment)
      form.querySelector("#new-visit-treatment").click();
  }
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
      form.queueOpenCourse?.();
      let values;
      const related = { medications: [], treatments: [] };
      if (store === "treatments") {
        const draft = editor.read();
        editor.validate(draft);
        values = draft.course;
        if (draft.medicine) related.medications.push(draft.medicine);
      } else values = readFields(store, form);
      if (store === "visits") {
        values.treatmentIds = [
          ...new Set([
            ...values.treatmentIds,
            ...stagedCourses.map((course) => course.id),
          ]),
        ];
        related.treatments = stagedCourses;
        related.medications = stagedMedicines.filter((medicine) =>
          stagedCourses.some((course) => course.medicationId === medicine.id),
        );
      }
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
