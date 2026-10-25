export const APP_VERSION = "1.4.0";
export const SCHEMA_VERSION = 5;
export const DB_NAME = "medly";
export const MAX_FILE_SIZE = 7 * 1024 * 1024;
export const FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const text = (key, label, extra = {}) => ({
  key,
  label,
  type: "text",
  ...extra,
});
const date = (key, label, required = false) => ({
  key,
  label,
  type: "date",
  required,
});
const area = (key, label) => ({ key, label, type: "textarea" });
const select = (key, label, options) => ({
  key,
  label,
  type: "select",
  options,
  required: true,
});
const ref = (key, label, store, multiple = false) => ({
  key,
  label,
  type: "reference",
  store,
  multiple,
});
export const definitions = {
  visits: {
    label: "Medical visits",
    singular: "Medical visit",
    icon: "visit",
    title: "reason",
    date: "date",
    description: "Each health episode, with its follow-ups kept together.",
    fields: [
      text("reason", "Reason for visit", { required: true }),
      {
        key: "date",
        label: "Date & time",
        type: "datetime-local",
        required: true,
      },
      ref("doctorId", "Doctor", "doctors"),
      ref("parentVisitId", "Follow-up to", "visits"),
      select("type", "Visit type", [
        "General consultation",
        "Specialist consultation",
        "Routine checkup",
        "Emergency visit",
        "Follow-up",
        "Dental visit",
        "Laboratory visit",
        "Hospital visit",
        "Surgery",
        "Other",
      ]),
      area("symptoms", "Symptoms"),
      area("findings", "Clinical findings"),
      area("procedures", "Tests & procedures"),
      ref("diagnosisIds", "Diagnoses", "diagnoses", true),
      ref("treatmentIds", "Existing treatments", "treatments", true),
      // Retain two former 20,000-character fields plus migration labels.
      { ...area("notes", "Notes"), maxLength: 40100 },
    ],
  },
  diagnoses: {
    label: "Diagnoses",
    singular: "Diagnosis",
    icon: "diagnosis",
    title: "name",
    date: "date",
    description: "A clearer view of your medical history.",
    fields: [
      text("name", "Diagnosis", { required: true }),
      date("date", "Date diagnosed", true),
      select("status", "Status", ["Active", "Resolved", "Monitoring"]),
      text("code", "Medical code (optional)"),
      area("notes", "Notes"),
    ],
  },
  treatments: {
    label: "Treatments",
    singular: "Treatment",
    icon: "treatment",
    title: "name",
    date: "startDate",
    description: "Each course of care, with its own dates and instructions.",
    fields: [
      text("name", "Treatment name", { required: true }),
      ref("medicationId", "Medication", "medications"),
      text("dosage", "Prescribed dosage"),
      text("frequency", "Frequency"),
      select("status", "Status", [
        "Active",
        "Completed",
        "Planned",
        "Stopped",
        "As needed",
      ]),
      date("startDate", "Start date"),
      date("endDate", "End date"),
      ref("doctorId", "Prescribed by", "doctors"),
      ref("diagnosisId", "Diagnosis", "diagnoses"),
      area("instructions", "Instructions"),
      area("notes", "Notes"),
    ],
  },
  medications: {
    label: "Medication library",
    singular: "Medication",
    icon: "medication",
    title: "name",
    description: "One entry per medicine. Each course belongs in Treatments.",
    fields: [
      text("name", "Medication name", { required: true }),
      text("strength", "Product strength (optional)"),
      text("form", "Form (e.g. tablet, liquid)"),
      area("notes", "Notes"),
    ],
  },
  doctors: {
    label: "Doctors & clinics",
    singular: "Doctor",
    icon: "doctor",
    title: "name",
    description: "The people and places that care for you.",
    fields: [
      text("name", "Full name", { required: true }),
      text("specialty", "Specialty"),
      ref("clinicId", "Clinic or hospital", "clinics"),
      text("phone", "Phone", { type: "tel" }),
      text("address", "Address"),
      area("notes", "Notes"),
    ],
  },
  clinics: {
    label: "Clinics",
    singular: "Clinic",
    icon: "clinic",
    title: "name",
    description: "Your reusable directory of care locations.",
    fields: [
      text("name", "Clinic name", { required: true }),
      text("type", "Type"),
      text("address", "Address"),
      text("phone", "Phone", { type: "tel" }),
      text("website", "Website", { type: "url" }),
      area("notes", "Notes"),
    ],
  },
  documents: {
    label: "Medical documents",
    singular: "Document",
    icon: "document",
    title: "name",
    date: "createdAt",
    description: "Your paperwork. A little more organized.",
    fields: [
      text("name", "File name", { required: true }),
      ref("visitId", "Medical visit", "visits"),
      area("description", "Description"),
    ],
  },
  appointments: {
    label: "Appointments",
    singular: "Appointment",
    icon: "calendar",
    title: "reason",
    date: "date",
    description: "A little space for what comes next.",
    fields: [
      text("reason", "Reason", { required: true }),
      {
        key: "date",
        label: "Date & time",
        type: "datetime-local",
        required: true,
      },
      ref("clinicId", "Clinic", "clinics"),
      ref("doctorId", "Doctor", "doctors"),
      select("status", "Status", [
        "Scheduled",
        "Completed",
        "Cancelled",
        "Missed",
      ]),
      ref("visitId", "Completed medical visit", "visits"),
      area("notes", "Notes"),
    ],
  },
};
export const STORES = Object.keys(definitions);
export const indexes = {
  visits: ["date", "doctorId", "type", "parentVisitId"],
  diagnoses: ["date", "status"],
  treatments: ["startDate", "endDate", "status", "medicationId", "doctorId"],
  medications: ["name"],
  doctors: ["name", "specialty", "clinicId"],
  clinics: ["name"],
  documents: ["visitId", "createdAt"],
  appointments: ["date", "status", "visitId"],
};
