import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "weekplanner.thoughtDraft.";
const DEBOUNCE_MS = 500;

function storageKey(threadId: string | null): string {
  return `${STORAGE_PREFIX}${threadId ?? "new"}`;
}

function readDraft(threadId: string | null): string {
  try {
    return window.localStorage.getItem(storageKey(threadId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(threadId: string | null, value: string): void {
  try {
    if (value) {
      window.localStorage.setItem(storageKey(threadId), value);
    } else {
      window.localStorage.removeItem(storageKey(threadId));
    }
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useDraftPersistence(threadId: string | null) {
  const [draft, setDraftRaw] = useState(() => readDraft(threadId));
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sync draft from localStorage when threadId changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftRaw(readDraft(threadId));
    setSaved(false);
  }, [threadId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);

    debounceRef.current = setTimeout(() => {
      writeDraft(threadId, draft);
      setSaved(true);
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, [draft, threadId]);

  const setDraft = useCallback((value: string | ((prev: string) => string)) => {
    setDraftRaw(value);
    setSaved(false);
  }, []);

  const clearDraft = useCallback(() => {
    setDraftRaw("");
    writeDraft(threadId, "");
    setSaved(false);
  }, [threadId]);

  return { draft, setDraft, clearDraft, saved } as const;
}
