import { DB_NAME, SCHEMA_VERSION, STORES, indexes } from "./schema.js";

let database;
export function openDatabase() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB)
      return reject(
        new Error(
          "Persistent storage is unavailable. Enable browser storage to use Medly.",
        ),
      );
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Migration 1: additive schema. Future migrations must preserve existing records.
      for (const name of STORES) {
        const store = db.objectStoreNames.contains(name)
          ? request.transaction.objectStore(name)
          : db.createObjectStore(name, { keyPath: "id" });
        for (const index of indexes[name])
          if (!store.indexNames.contains(index))
            store.createIndex(index, index, { unique: false });
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(
          "Close other Medly tabs and reload to finish the database update.",
        ),
      );
    request.onsuccess = () => {
      database = request.result;
      database.onversionchange = () => {
        database.close();
        database = undefined;
        location.reload();
      };
      resolve(database);
    };
  });
}

// Resolve only after the transaction commits, never just when an individual request succeeds.
export async function transaction(names, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        tx.error ||
          new Error("The operation was cancelled. No changes were saved."),
      );
    tx.onerror = () => {};
    try {
      result = operation(tx);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export async function snapshot() {
  const result = {};
  await transaction(STORES, "readonly", (tx) => {
    for (const name of STORES)
      tx.objectStore(name).getAll().onsuccess = (event) => {
        result[name] = event.target.result;
      };
  });
  return result;
}

export function clearDatabase() {
  return transaction(STORES, "readwrite", (tx) => {
    for (const name of STORES) tx.objectStore(name).clear();
  });
}
