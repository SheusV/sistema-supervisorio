import type { Run } from "./alarmHistory";
import type { Batch } from "./drying";
import type { OperationCheckpoint } from "./operationCheckpoint";

export interface RecordedBatch { id: string; scope: string; started: number; unit: string; batch: Batch }

export interface RecordedRun {
  alarmName?: string; alarmPriority?: string;
  id: string; scope: string; started: number;
  unit: string; min: number; max: number; limit?: number; hysteresis?: number; delaySeconds?: number; run: Run;
}
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open("nexo-operation-history", 3);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("checkpoints")) request.result.createObjectStore("checkpoints", { keyPath: "scope" });
        for (const name of ["runs", "batches"]) {
          if (request.result.objectStoreNames.contains(name)) continue;
          const store = request.result.createObjectStore(name, { keyPath: "id" });
          store.createIndex("byScope", "scope");
          store.createIndex("byTime", ["scope", "started", "id"]);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error("Feche outras abas do supervisório para atualizar o histórico.")); };
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
  return storeRecord("runs", record);
}
export async function pastBatches(scope: string): Promise<RecordedBatch[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("batches").objectStore("batches").index("byScope").getAll(scope);
    request.onsuccess = () => resolve((request.result as RecordedBatch[]).sort((a,b) => b.started - a.started));
    request.onerror = () => reject(request.error);
  });
}
export async function storeBatch(record: RecordedBatch) {
  return storeRecord("batches", record);
}

export async function readCheckpoint(scope: string): Promise<OperationCheckpoint | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("checkpoints").objectStore("checkpoints").get(scope);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeCheckpoint(scope: string, point: OperationCheckpoint | undefined, expected: string | null): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkpoints", "readwrite");
    const store = tx.objectStore("checkpoints");
    let conflict: Error | undefined;
    const request = store.get(scope);
    request.onsuccess = () => {
      const currentRevision = typeof request.result?.revision === "string" ? request.result.revision : null;
      if (currentRevision !== expected) {
        conflict = new Error("Outra aba atualizou a operação. Recarregue o ponto salvo antes de continuar.");
        tx.abort();
        return;
      }
      if (point) store.put(point);
      else store.delete(scope);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(conflict ?? tx.error ?? new Error("Gravação interrompida."));
  });
}
async function storeRecord(store: string, record: RecordedRun | RecordedBatch) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const runs = tx.objectStore(store);
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
