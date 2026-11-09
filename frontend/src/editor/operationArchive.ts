import type { Run } from "./alarmHistory";

export interface RecordedRun {
  id: string; scope: string; started: number;
  unit: string; min: number; max: number; limit?: number; run: Run;
}
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nexo-operation-history", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("runs", { keyPath: "id" });
        store.createIndex("byScope", "scope");
        store.createIndex("byTime", ["scope", "started", "id"]);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => { opening = undefined; throw error; });
  }
  return opening;
}
export async function pastRuns(scope: string, currentId: string): Promise<RecordedRun[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("runs").objectStore("runs").index("byScope").getAll(scope);
    request.onsuccess = () => resolve((request.result as RecordedRun[]).filter(r => r.id !== currentId).sort((a,b) => b.started - a.started));
    request.onerror = () => reject(request.error);
  });
}
export async function storeRun(record: RecordedRun) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("runs", "readwrite");
    const runs = tx.objectStore("runs");
    runs.put(record);
    const range = IDBKeyRange.bound([record.scope], [record.scope, []]);
    const keys = runs.index("byTime").getAllKeys(range);
    keys.onsuccess = () => {
      for (const expired of keys.result.slice(0, -20)) runs.delete(expired);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
