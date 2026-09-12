// A boolean preference persisted to localStorage and kept in sync across every
// component using the same key in this tab — no storage-event round trip, so
// a toggle on Profile is reflected immediately by AppLayout's listener without
// either remounting.
import { useEffect, useState } from "react";

const listeners = new Map<string, Set<(v: boolean) => void>>();

function read(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function write(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private mode / disabled storage — preference is session-only */
  }
  listeners.get(key)?.forEach((notify) => notify(value));
}

export function usePersistedToggle(key: string, fallback = false): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => read(key, fallback));

  useEffect(() => {
    const set = listeners.get(key) ?? new Set();
    set.add(setValue);
    listeners.set(key, set);
    return () => {
      set.delete(setValue);
    };
  }, [key]);

  return [value, (v: boolean) => write(key, v)];
}
