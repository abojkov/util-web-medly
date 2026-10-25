import { definitions, FILE_TYPES, MAX_FILE_SIZE } from "../db/schema.js";
export const isUUID = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function validateRecord(store, record, entityDefinitions = definitions) {
  const definition = entityDefinitions[store];
  if (!definition || !record || !isUUID(record.id))
    throw new Error("Invalid record identifier.");
  for (const key of ["createdAt", "updatedAt"])
    if (
      typeof record[key] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record[key]) ||
      !Number.isFinite(Date.parse(record[key])) ||
      new Date(record[key]).toISOString() !== record[key]
    )
      throw new Error("Invalid record timestamp.");
  for (const field of definition.fields) {
    const value = record[field.key];
    if (field.required && (typeof value !== "string" || !value.trim()))
      throw new Error(`${field.label} is required.`);
    if (value === undefined || value === "") continue;
    if (field.multiple) {
      if (
        !Array.isArray(value) ||
        !value.every(isUUID) ||
        new Set(value).size !== value.length
      )
        throw new Error(`Invalid ${field.label.toLowerCase()}.`);
    } else if (typeof value !== "string" || value.length > 20000)
      throw new Error(`${field.label} must be text, up to 20,000 characters.`);
    if (field.type === "reference" && !field.multiple && !isUUID(value))
      throw new Error(`Invalid ${field.label.toLowerCase()}.`);
    if (field.options && !field.options.includes(value))
      throw new Error(`Invalid ${field.label.toLowerCase()}.`);
    if (field.type === "date" || field.type === "datetime-local") {
      const pattern =
        field.type === "date"
          ? /^\d{4}-\d{2}-\d{2}$/
          : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      const day = value.slice(0, 10);
      if (
        !pattern.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day ||
        (field.type === "datetime-local" &&
          (Number(value.slice(11, 13)) > 23 ||
            Number(value.slice(14, 16)) > 59))
      )
        throw new Error(`Invalid ${field.label.toLowerCase()}.`);
    }
    if (field.type === "url" && value && !/^https?:\/\//i.test(value))
      throw new Error("Website must start with https:// or http://.");
  }
  if (record.startDate && record.endDate && record.endDate < record.startDate)
    throw new Error("End date must be on or after the start date.");
  if (store === "documents") {
    if (!(record.blob instanceof Blob))
      throw new Error("The document file is missing.");
    if (
      !FILE_TYPES.includes(record.type) ||
      record.blob.type !== record.type ||
      record.size !== record.blob.size ||
      record.size === 0 ||
      record.size > MAX_FILE_SIZE
    )
      throw new Error(
        "Documents must be PDF, JPEG, PNG, or WebP and no larger than 7 MB.",
      );
  }
  return record;
}
export async function validateFile(file) {
  if (
    !file ||
    !FILE_TYPES.includes(file.type) ||
    !file.size ||
    file.size > MAX_FILE_SIZE
  )
    throw new Error("Choose a PDF, JPEG, PNG, or WebP file up to 7 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid =
    file.type === "application/pdf"
      ? ascii(0, 5) === "%PDF-"
      : file.type === "image/png"
        ? bytes[0] === 137 && ascii(1, 4) === "PNG"
        : file.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (!valid)
    throw new Error(
      "The file contents do not match its type. Choose an original supported file.",
    );
}
