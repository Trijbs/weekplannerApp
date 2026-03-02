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
    const payloadError = await response.json().catch(() => ({ error: "Request mislukt" }));
    throw new Error(payloadError.error ?? "Request mislukt");
  }

  const json = (await response.json()) as { data: T };
  return { queued: false, data: json.data };
}
