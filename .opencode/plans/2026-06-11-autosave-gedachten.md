# Autosave Gedachten-tab — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement debounced autosave for the Gedachten-tab textarea so draft text persists across tab switches, page refreshes, and app restarts via localStorage.

**Architecture:** Add a `useDraftPersistence` hook that syncs the `draft` state to/from localStorage with a 500ms debounce. Each thread (or "new" draft) gets its own localStorage key. A subtle "Concept opgeslagen" indicator confirms saves.

**Tech Stack:** React hooks, localStorage (already used in codebase with `weekplanner.*` key prefix).

---

## Files to Modify

- **Create:** `src/components/weekplanner/useDraftPersistence.ts` — custom hook for debounced localStorage draft sync
- **Modify:** `src/components/weekplanner/ThoughtInbox.tsx` — integrate hook, add indicator UI
- **Modify:** `src/lib/i18n.ts` — add translation strings for autosave indicator

---

## Task 1: Create `useDraftPersistence` hook

**Files:**
- Create: `src/components/weekplanner/useDraftPersistence.ts`

- [ ] **Step 1: Write the hook**

```typescript
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

  // Load draft when threadId changes
  useEffect(() => {
    setDraftRaw(readDraft(threadId));
    setSaved(false);
  }, [threadId]);

  // Debounced save on draft change
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors from the new file.

---

## Task 2: Integrate hook into ThoughtInbox

**Files:**
- Modify: `src/components/weekplanner/ThoughtInbox.tsx`

- [ ] **Step 1: Import the hook and replace draft state**

At line 3, add import:
```typescript
import { useDraftPersistence } from "./useDraftPersistence";
```

Replace line 97:
```typescript
// OLD: const [draft, setDraft] = useState("");
```
With:
```typescript
const { draft, setDraft, clearDraft, saved: draftSaved } = useDraftPersistence(activeThreadId);
```

- [ ] **Step 2: Update `saveThought` to use `clearDraft` instead of `setDraft("")`**

In `saveThought` (line 249), replace:
```typescript
setDraft("");
```
With:
```typescript
clearDraft();
```

- [ ] **Step 3: Add autosave indicator below the textarea**

In the bottom bar of the textarea area (lines 426-436), replace the static hint text:

```typescript
<span className="text-xs text-slate-500">{t("Wordt automatisch samengevat na het opslaan")}</span>
```

With a dynamic indicator that shows autosave status:

```typescript
<span className="text-xs text-slate-500">
  {draftSaved && draft.trim()
    ? t("Concept opgeslagen")
    : t("Wordt automatisch samengevat na het opslaan")}
</span>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

---

## Task 3: Add translation strings

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add Dutch → English translation**

In the `staticTranslations` object (around line 37), add:
```typescript
"Concept opgeslagen": "Draft saved",
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

---

## Task 4: Manual verification

- [ ] **Step 1: Test autosave on typing**

1. Open the Gedachten-tab
2. Type text in the textarea
3. Wait 500ms — verify "Concept opgeslagen" appears
4. Switch to Uurblokken-tab
5. Switch back to Gedachten-tab
6. Verify the draft text is restored

- [ ] **Step 2: Test page refresh persistence**

1. Type text in the textarea
2. Wait for "Concept opgeslagen"
3. Refresh the page (Cmd+R / F5)
4. Navigate to Gedachten-tab
5. Verify the draft text is restored

- [ ] **Step 3: Test per-thread drafts**

1. Type text in thread A's textarea
2. Switch to thread B
3. Type different text in thread B's textarea
4. Switch back to thread A
5. Verify thread A's draft is preserved independently

- [ ] **Step 4: Test draft clears on save**

1. Type text in the textarea
2. Click "Opslaan" (or Cmd+Enter)
3. Verify the textarea clears and the draft is removed from localStorage
4. Refresh the page — the old draft should NOT reappear

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit --pretty`
Expected: No errors.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage mechanism | localStorage | Already used in codebase, survives refresh, no API needed |
| Key format | `weekplanner.thoughtDraft.{id}` | Consistent with existing `weekplanner.*` prefix pattern |
| Debounce interval | 500ms | Balances responsiveness with write frequency |
| "Saved" indicator timeout | 2s | Enough to be noticed, not distracting |
| Draft per thread | Yes, keyed by `activeThreadId` (null = "new") | Supports multiple open threads with independent draft state |
| Clear on save | Yes | Prevents stale drafts from reappearing |
