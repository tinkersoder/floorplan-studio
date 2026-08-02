import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Project } from '../model/schema';

interface FpDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbp: Promise<IDBPDatabase<FpDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<FpDB>('floorplan-studio', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('meta');
      },
    });
  }
  return dbp;
}

export async function saveProject(p: Project): Promise<void> {
  const d = await db();
  await d.put('projects', p);
  await d.put('meta', p.id, 'lastProjectId');
}

export async function listProjects(): Promise<Project[]> {
  const d = await db();
  const all = await d.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const d = await db();
  return d.get('projects', id);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  await d.delete('projects', id);
}

export async function getLastProjectId(): Promise<string | undefined> {
  const d = await db();
  return (await d.get('meta', 'lastProjectId')) as string | undefined;
}
