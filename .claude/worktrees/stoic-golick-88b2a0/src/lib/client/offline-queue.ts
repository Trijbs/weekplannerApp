import { openDB } from "idb";

const DB_NAME = "weekplanner-offline";
const STORE_NAME = "mutations";

export interface QueuedMutation {
  id?: number;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: string;
  headers: Record<string, string>;
  createdAt: number;
}

async function dbPromise() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

export async function queueMutation(mutation: Omit<QueuedMutation, "id" | "createdAt">): Promise<void> {
  const db = await dbPromise();
  await db.add(STORE_NAME, { ...mutation, createdAt: Date.now() } as QueuedMutation);
}

export async function getQueuedCount(): Promise<number> {
  const db = await dbPromise();
  return db.count(STORE_NAME);
}

type ApiErrorPayload = {
  error?: string;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
};

function formatApiErrorMessage(payload: ApiErrorPayload): string {
  const baseMessage = payload.error?.trim() || "Request mislukt";
  const details = payload.details;
  if (!details) {
    return baseMessage;
  }

  const detailParts: string[] = [];
  for (const formError of details.formErrors ?? []) {
    const normalized = formError.trim();
    if (normalized) {
      detailParts.push(normalized);
    }
  }

  for (const [field, messages] of Object.entries(details.fieldErrors ?? {})) {
    const normalizedMessages = (messages ?? []).map((message) => message.trim()).filter(Boolean);
    if (normalizedMessages.length > 0) {
      detailParts.push(`${field}: ${normalizedMessages.join(", ")}`);
    }
  }

  if (detailParts.length === 0) {
    return baseMessage;
  }

  return `${baseMessage}: ${detailParts.join(" | ")}`;
}

export async function flushMutationQueue(): Promise<{ sent: number; failed: number }> {
  const db = await dbPromise();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const all = await store.getAll();

  let sent = 0;
  let failed = 0;

  for (const item of all) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...item.headers,
        },
        body: item.body,
      });

      if (!response.ok) {
        failed += 1;
        continue;
      }

      if (item.id != null) {
        await store.delete(item.id);
      }
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await tx.done;
  return { sent, failed };
}

export async function mutationFetch<T>(
  url: string,
  init: { method: "POST" | "PATCH" | "DELETE"; body: unknown },
): Promise<{ queued: boolean; data?: T }> {
  const payload = JSON.stringify(init.body ?? {});

  if (!navigator.onLine) {
    await queueMutation({
      url,
      method: init.method,
      body: payload,
      headers: {},
    });
    return { queued: true };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });
  } catch {
    await queueMutation({
      url,
      method: init.method,
      body: payload,
      headers: {},
    });
    return { queued: true };
  }

  if (!response.ok) {
    const payloadError = await response.json().catch(() => ({ error: "Request mislukt" } satisfies ApiErrorPayload));
    throw new Error(formatApiErrorMessage(payloadError));
  }

  const json = (await response.json()) as { data: T };
  return { queued: false, data: json.data };
}
