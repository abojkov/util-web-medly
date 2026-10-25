import { snapshot, transaction } from "../db/database.js";
import {
  APP_VERSION,
  SCHEMA_VERSION,
  STORES,
  definitions,
} from "../db/schema.js";
import { validateRecord, validateFile } from "../utils/validation.js";
import { validateRelationships } from "../db/relationships.js";
import {
  legacyDefinitions,
  version2Definitions,
  version4Definitions,
  version5Definitions,
  withDocumentIssueDates,
  moveVisitFollowupNotes,
  migrateV1,
  flattenFollowups,
} from "../db/migrations.js";
export { validateRelationships } from "../db/relationships.js";

async function encodeBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}

export async function createBackup() {
  const data = await snapshot();
  for (const document of data.documents) {
    document.base64 = await encodeBlob(document.blob);
    delete document.blob;
  }
  return {
    format: "medly-backup",
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function parseBackup(input) {
  let backup;
  try {
    backup = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw new Error("This file is not valid JSON. Choose a Medly backup.");
  }
  if (
    !backup ||
    backup.format !== "medly-backup" ||
    ![1, 2, 3, 4, 5, SCHEMA_VERSION].includes(backup.schemaVersion) ||
    !backup.data ||
    typeof backup.appVersion !== "string" ||
    !Number.isFinite(Date.parse(backup.exportedAt))
  )
    throw new Error(
      "This is not a supported Medly backup (schema versions 1 through 6).",
    );
  const entityDefinitions =
    backup.schemaVersion === 1
      ? legacyDefinitions
      : backup.schemaVersion === 2
        ? version2Definitions
        : backup.schemaVersion < 5
          ? version4Definitions
          : backup.schemaVersion === 5
            ? version5Definitions
            : definitions;
  const data = {};
  for (const store of STORES) {
    if (!Array.isArray(backup.data[store]))
      throw new Error(`The backup is missing ${store}.`);
    const ids = new Set();
    data[store] = [];
    for (const source of backup.data[store]) {
      if (!source || typeof source !== "object" || Array.isArray(source))
        throw new Error("The backup contains an invalid record.");
      const allowed = new Set([
        "id",
        "createdAt",
        "updatedAt",
        ...entityDefinitions[store].fields.map((f) => f.key),
        ...(store === "documents" ? ["type", "size", "base64"] : []),
      ]);
      if (Object.keys(source).some((key) => !allowed.has(key)))
        throw new Error("The backup contains unsupported record fields.");
      const record = { ...source };
      if (store === "documents") {
        if (
          typeof record.base64 !== "string" ||
          record.base64.length > 9800000 ||
          record.base64.length % 4 !== 0 ||
          /[^A-Za-z0-9+/=]/.test(record.base64)
        )
          throw new Error("A document attachment is corrupted or too large.");
        let binary;
        try {
          binary = atob(record.base64);
          if (btoa(binary) !== record.base64) throw new Error();
        } catch {
          throw new Error("A document attachment has invalid Base64 encoding.");
        }
        record.blob = new Blob(
          [Uint8Array.from(binary, (char) => char.charCodeAt(0))],
          { type: record.type },
        );
        delete record.base64;
        await validateFile(record.blob);
      }
      validateRecord(store, record, entityDefinitions);
      if (ids.has(record.id))
        throw new Error("The backup contains duplicate identifiers.");
      ids.add(record.id);
      data[store].push(record);
    }
  }
  validateRelationships(data, entityDefinitions, {
    allowNested: backup.schemaVersion === 3,
  });
  if (backup.schemaVersion === 3) data.visits = flattenFollowups(data.visits);
  const migrated = backup.schemaVersion === 1 ? migrateV1(data) : data;
  if (backup.schemaVersion < 5)
    migrated.visits = migrated.visits.map(moveVisitFollowupNotes);
  if (backup.schemaVersion < 6)
    migrated.documents = withDocumentIssueDates(migrated);
  for (const store of STORES)
    for (const record of migrated[store]) validateRecord(store, record);
  return migrated;
}

export async function importBackup(data, mode) {
  if (!["merge", "replace"].includes(mode))
    throw new Error("Choose merge or replace.");
  for (const store of STORES)
    for (const record of data[store]) validateRecord(store, record);
  validateRelationships(data);
  let validationError;
  try {
    await transaction(STORES, "readwrite", (tx) => {
      const current = {};
      let remaining = STORES.length;
      for (const store of STORES)
        tx.objectStore(store).getAll().onsuccess = (event) => {
          current[store] = event.target.result;
          if (--remaining) return;
          try {
            const merged = {};
            for (const name of STORES) {
              const records = new Map(
                (mode === "merge" ? current[name] : []).map((record) => [
                  record.id,
                  record,
                ]),
              );
              for (const record of data[name]) {
                const previous = records.get(record.id);
                if (
                  !previous ||
                  Date.parse(record.updatedAt) > Date.parse(previous.updatedAt)
                )
                  records.set(record.id, record);
              }
              merged[name] = [...records.values()];
            }
            validateRelationships(merged);
            for (const name of STORES) {
              const store = tx.objectStore(name);
              if (mode === "replace") store.clear();
              for (const record of merged[name]) store.put(record);
            }
          } catch (error) {
            validationError = error;
            tx.abort();
          }
        };
    });
  } catch (error) {
    throw validationError || error;
  }
}
