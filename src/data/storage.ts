import type { Project } from '../model';
import { parseProject, serializeProject } from './project';
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}
export interface ProjectRepository {
  save(p: Project): Promise<void>;
  load(id: string): Promise<Project | null>;
  list(): Promise<ProjectSummary[]>;
  remove(id: string): Promise<void>;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rack-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const request = action(tx.objectStore('projects'));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Local storage transaction aborted.'));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const repository: ProjectRepository = {
  async save(p) {
    await transaction('readwrite', (store) =>
      store.put({ id: p.id, name: p.name, updatedAt: p.updatedAt, json: serializeProject(p) }),
    );
    localStorage.setItem('rack-studio-last-project', p.id);
  },
  async load(id) {
    const row = await transaction<{ json: string } | undefined>('readonly', (store) =>
      store.get(id),
    );
    return row ? parseProject(row.json) : null;
  },
  async list() {
    const rows = await transaction<(ProjectSummary & { json: string })[]>('readonly', (store) =>
      store.getAll(),
    );
    return rows
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async remove(id) {
    await transaction('readwrite', (store) => store.delete(id));
  },
};
