import { formFields, readFields, bindFieldSearch } from "./form-fields.js";
import { newestCourses, courseLabel } from "../utils/care.js";
import { escapeHTML as e, today } from "../utils/format.js";
import { validateRecord } from "../utils/validation.js";
export function treatmentEditor(
  root,
  data,
  initial = {},
  prefix = "course-",
  markDirty = () => {},
) {
  const fresh = {
    startDate: today(),
    endDate: "",
    status: "Active",
    ...initial,
  };
  function render(values) {
    root.innerHTML = `<label class="form-label" for="${prefix}reuse">Reuse a previous treatment (optional)</label><select class="form-select mb-3" id="${prefix}reuse"><option value="">Start a new course</option>${newestCourses(
      data.treatments,
    )
      .map(
        (course) =>
          `<option value="${course.id}">${e(courseLabel(course, data))}</option>`,
      )
      .join(
        "",
      )}</select><p class="form-text">Each course has its own prescription details. Review copied details before saving.</p><div class="row g-3">${formFields("treatments", data, values, prefix)}</div><fieldset class="new-medicine-fields mt-3" id="${prefix}new-medicine" hidden disabled><legend>New library medicine</legend><div class="row g-3">${formFields("medications", data, {}, `${prefix}medicine-`)}</div></fieldset>`;
    bindFieldSearch(root);
    const medicineSelect = root.querySelector(`#${prefix}medicationId`);
    const newMedicine = root.querySelector(`#${prefix}new-medicine`);
    medicineSelect.onchange = () => {
      const isNew = medicineSelect.value === "__new__";
      newMedicine.hidden = !isNew;
      newMedicine.disabled = !isNew;
      const name = root.querySelector(`#${prefix}name`);
      if (!name.value && !isNew)
        name.value =
          data.medications.find(
            (medicine) => medicine.id === medicineSelect.value,
          )?.name || "";
      markDirty();
    };
    root.querySelector(`#${prefix}medicine-name`).oninput = (event) => {
      const name = root.querySelector(`#${prefix}name`);
      if (!name.value || name.dataset.autofilled === "true") {
        name.value = event.target.value;
        name.dataset.autofilled = "true";
      }
    };
    root.querySelector(`#${prefix}name`).addEventListener("input", (event) => {
      event.target.dataset.autofilled = "false";
    });
    root.querySelector(`#${prefix}reuse`).onchange = (event) => {
      const selected = data.treatments.find(
        (course) => course.id === event.target.value,
      );
      if (selected) {
        const {
          name,
          medicationId,
          dosage,
          frequency,
          doctorId,
          diagnosisId,
          instructions,
          notes,
        } = selected;
        render({
          name,
          medicationId,
          dosage,
          frequency,
          doctorId,
          diagnosisId,
          instructions,
          notes,
          startDate: fresh.startDate,
          endDate: "",
          status: "Active",
        });
        markDirty();
      }
    };
  }
  render(fresh);
  return {
    read() {
      const course = readFields("treatments", root, prefix);
      let medicine;
      if (course.medicationId === "__new__") {
        medicine = {
          ...readFields("medications", root, `${prefix}medicine-`),
          id: crypto.randomUUID(),
        };
        course.medicationId = medicine.id;
      }
      return { course, medicine };
    },
    validate(draft) {
      const now = new Date().toISOString();
      for (const [store, record] of [
        ["treatments", draft.course],
        ["medications", draft.medicine],
      ])
        if (record)
          validateRecord(store, {
            ...record,
            id: record.id || crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          });
    },
  };
}
