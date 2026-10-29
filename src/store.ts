// Drafts live in localStorage as one list. Earlier builds stored a single doc; that gets migrated.

export type Rev = { id: string; text: string; banked: boolean; note: string; createdAt: number };
export type Doc = { id: string; title: string; revs: Rev[]; createdAt: number; updatedAt: number };
type Store = { docs: Doc[] };

const KEY = "revisions:drafts";
const LEGACY_KEY = "revisions:doc";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const newRev = (text = ""): Rev => ({ id: uid(), text, banked: false, note: "", createdAt: Date.now() });
export const newDoc = (title = "Untitled"): Doc => ({
  id: uid(),
  title,
  revs: [newRev()],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

let store: Store | null = null;

export function loadStore(): Store {
  if (store) return store;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (Array.isArray(s.docs)) {
        store = s;
        return s;
      }
    }
  } catch {
    /* fall through */
  }
  store = { docs: [] };
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const d = JSON.parse(legacy) as { title?: string; revs?: Rev[] };
      if (Array.isArray(d.revs) && d.revs.length) {
        const doc = newDoc(d.title || "Untitled");
        doc.revs = d.revs;
        doc.createdAt = d.revs[0]?.createdAt ?? Date.now();
        doc.updatedAt = d.revs[d.revs.length - 1]?.createdAt ?? Date.now();
        store.docs.push(doc);
        saveStore();
        localStorage.removeItem(LEGACY_KEY);
      }
    }
  } catch {
    /* ignore a broken legacy doc */
  }
  return store;
}

export function saveStore() {
  if (!store) return;
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function getDoc(id: string): Doc | undefined {
  return loadStore().docs.find((d) => d.id === id);
}

export function addDoc(doc: Doc) {
  loadStore().docs.unshift(doc);
  saveStore();
}

export function removeDoc(id: string) {
  const s = loadStore();
  s.docs = s.docs.filter((d) => d.id !== id);
  saveStore();
}

/** "just now", "5 min ago", "2 h ago", "yesterday", "3 d ago", or a short date. */
export function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
