// Short success messages ("Assigned to Sara Benali"), shown bottom-right by <Notifications />.
import { useSyncExternalStore } from "react";

export interface Note {
  id: number;
  title: string;
  detail?: string;
}

let notes: Note[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Show a green confirmation. It fades out on its own. */
export function notify(title: string, detail?: string) {
  notes = [...notes, { id: nextId++, title, detail }].slice(-4); // never more than 4 on screen
  emit();
}

export function dismiss(id: number) {
  notes = notes.filter((n) => n.id !== id);
  emit();
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export function useNotes(): Note[] {
  return useSyncExternalStore(subscribe, () => notes);
}
