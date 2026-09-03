"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WidgetDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWidgetData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): WidgetDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchCountRef = useRef(0);

  const doFetch = useCallback(async () => {
    const count = ++fetchCountRef.current;
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    try {
      const result = await fetcher(controller.signal);
      if (mountedRef.current && count === fetchCountRef.current) {
        setData(result);
      }
    } catch (err: unknown) {
      if (mountedRef.current && count === fetchCountRef.current) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Data laden mislukt");
      }
    } finally {
      if (mountedRef.current && count === fetchCountRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    void doFetch();
    return () => {
      mountedRef.current = false;
    };
  }, [doFetch]);

  return { data, loading, error, refetch: doFetch };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = (await response.json()) as { data?: T; error?: string };
  if (!json.data) throw new Error(json.error ?? "Geen data");
  return json.data;
}

export { fetchJson };
