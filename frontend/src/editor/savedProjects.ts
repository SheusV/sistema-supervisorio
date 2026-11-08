import { parseProject, serializeProject, type HmiProject } from "./project";

const databaseName = "nexo-project-library";
const storeName = "projects";

interface Entry {
  name: string;
  revision: string;
  document: string;
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "name" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void) {
  const db = await openLibrary();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      let value: T;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error("Gravação interrompida."));
      run(transaction.objectStore(storeName), next => { value = next; });
    });
  } finally {
    db.close();
  }
}

export function listProjects() {
  return useStore<string[]>("readonly", (store, result) => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => result(keys.result.map(String).sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
}

export async function readEntry(name: string) {
  const entry = await useStore<Entry | undefined>("readonly", (store, result) => {
    const request = store.get(name);
    request.onsuccess = () => result(request.result);
  });
  if (!entry) throw new Error("O projeto já não está na lista deste navegador.");
  return entry;
}

export async function readProject(name: string) {
  return parseProject((await readEntry(name)).document);
}

export async function editSavedEntry(entry: Entry, newName: string | null) {
  const renamed = newName === null ? null : {
    name: newName,
    document: serializeProject({ ...parseProject(entry.document), name: newName }),
    revision: crypto.randomUUID(),
  };
  const error = await useStore<string>("readwrite", (store, result) => {
    const read = store.get(entry.name);
    read.onsuccess = () => {
      if (read.result?.revision !== entry.revision) {
        result("O projeto mudou em outra aba. Selecione a versão atual e tente novamente.");
        return;
      }
      if (!renamed) {
        store.delete(entry.name);
        result("");
        return;
      }
      const destination = store.getKey(renamed.name);
      destination.onsuccess = () => {
        if (destination.result !== undefined) {
          result("Este nome já está em uso. Escolha outro nome.");
          return;
        }
        store.add(renamed);
        store.delete(entry.name);
        result("");
      };
    };
  });
  if (error) throw new Error(error);
}

type SaveResult = { saved: true } | { saved: false; revision: string | null };

export function saveProject(project: HmiProject, expectedRevision?: string) {
  const document = serializeProject(project);
  return useStore<SaveResult>("readwrite", (store, result) => {
    const request = store.get(project.name);
    request.onsuccess = () => {
      const existing: Entry | undefined = request.result;
      if (!existing && expectedRevision !== undefined) {
        result({ saved: false, revision: null });
        return;
      }
      if (existing && existing.revision !== expectedRevision) {
        result({ saved: false, revision: existing.revision });
        return;
      }
      store.put({ name: project.name, document, revision: crypto.randomUUID() } satisfies Entry);
      result({ saved: true });
    };
  });
}
