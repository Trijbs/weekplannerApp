"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ThoughtMessage,
  ThoughtSummary,
  ThoughtThread,
  Weekday,
  WeekRecord,
} from "@/lib/db/types";
import { WEEKDAYS } from "@/lib/db/types";

type ThoughtThreadDetail = {
  thread: ThoughtThread;
  messages: ThoughtMessage[];
  summaries: ThoughtSummary[];
};

type ThoughtInboxProps = {
  currentWeek: WeekRecord | null;
  weekdayLabels: Record<Weekday, string>;
  translate: (text: string) => string;
  onCreateTask: (title: string, weekday: Weekday) => Promise<boolean>;
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.data) {
    throw new Error(json.error ?? "Request mislukt");
  }
  return json.data;
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function suggestedThreadTitle(value: string): string {
  return value.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 140);
}

export function ThoughtInbox({
  currentWeek,
  weekdayLabels,
  translate,
  onCreateTask,
}: ThoughtInboxProps) {
  const t = translate;
  const [threads, setThreads] = useState<ThoughtThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThoughtThreadDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [taskDay, setTaskDay] = useState<Weekday>("maandag");
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [promotingTask, setPromotingTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latestSummary = detail?.summaries[0] ?? null;

  const loadThreads = useCallback(async () => {
    const response = await fetch("/api/thoughts/threads", { cache: "no-store" });
    const data = await readJson<{ threads: ThoughtThread[] }>(response);
    setThreads(data.threads);
    if (!activeThreadId && data.threads[0]) {
      setActiveThreadId(data.threads[0].id);
    }
  }, [activeThreadId]);

  const loadDetail = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/thoughts/threads/${threadId}/messages`, { cache: "no-store" });
    const data = await readJson<ThoughtThreadDetail>(response);
    setDetail(data);
  }, []);

  useEffect(() => {
    void loadThreads().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : t("Gedachten laden mislukt."));
    });
  }, [loadThreads, t]);

  useEffect(() => {
    if (!activeThreadId) {
      setDetail(null);
      return;
    }

    void loadDetail(activeThreadId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : t("Gesprek laden mislukt."));
    });
  }, [activeThreadId, loadDetail, t]);

  const createThread = useCallback(async (initialText = "") => {
    const response = await fetch("/api/thoughts/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: currentWeek?.id ?? null,
        title: initialText ? suggestedThreadTitle(initialText) : "Nieuwe gedachten",
      }),
    });
    const data = await readJson<{ thread: ThoughtThread }>(response);
    setThreads((prev) => [data.thread, ...prev]);
    setActiveThreadId(data.thread.id);
    return data.thread;
  }, [currentWeek?.id]);

  const saveThought = useCallback(async () => {
    const bodyText = draft.trim();
    if (!bodyText) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const thread = activeThreadId ? null : await createThread(bodyText);
      const threadId = activeThreadId ?? thread?.id;
      if (!threadId) {
        throw new Error(t("Gesprek ontbreekt."));
      }

      const response = await fetch(`/api/thoughts/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyText }),
      });
      const data = await readJson<{ message: ThoughtMessage }>(response);
      setDraft("");
      setDetail((prev) =>
        prev && prev.thread.id === threadId
          ? { ...prev, messages: [...prev.messages, data.message] }
          : prev,
      );
      await loadThreads();
      await loadDetail(threadId);
      await fetch(`/api/thoughts/threads/${threadId}/summarize`, { method: "POST" }).catch(() => null);
      await loadDetail(threadId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Gedachte opslaan mislukt."));
    } finally {
      setBusy(false);
    }
  }, [activeThreadId, createThread, draft, loadDetail, loadThreads, t]);

  const summarize = useCallback(async () => {
    if (!activeThreadId) {
      return;
    }

    setSummarizing(true);
    setError(null);
    try {
      const response = await fetch(`/api/thoughts/threads/${activeThreadId}/summarize`, {
        method: "POST",
      });
      const data = await readJson<{ summary: ThoughtSummary }>(response);
      setDetail((prev) =>
        prev && prev.thread.id === activeThreadId
          ? { ...prev, summaries: [data.summary, ...prev.summaries] }
          : prev,
      );
      await loadThreads();
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : t("Samenvatten mislukt."));
    } finally {
      setSummarizing(false);
    }
  }, [activeThreadId, loadThreads, t]);

  const messageCountLabel = useMemo(() => {
    const count = detail?.messages.length ?? 0;
    return `${count} ${count === 1 ? t("gedachte") : t("gedachten")}`;
  }, [detail?.messages.length, t]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{t("Gedachten")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {t("Schrijf alles eerst op één plek. De samenvatting maakt er daarna ideeën, acties en planningpunten van.")}
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          onClick={() => void createThread().catch((createError) => {
            setError(createError instanceof Error ? createError.message : t("Gesprek aanmaken mislukt."));
          })}
        >
          {t("Nieuw gesprek")}
        </button>
      </div>

      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)_360px]">
        <aside className="border-b border-slate-200 bg-slate-50 p-3 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Gesprekken")}</h3>
            <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{threads.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {threads.length ? threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  thread.id === activeThreadId
                    ? "border-blue-300 bg-blue-50 text-slate-950"
                    : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-100"
                }`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <span className="block truncate font-semibold">
                  {thread.title === "Nieuwe gedachten" ? t("Nieuwe gedachten") : thread.title || t("Zonder titel")}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {formatShortDate(thread.updatedAt)}
                </span>
              </button>
            )) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm leading-5 text-slate-500">
                {t("Nog geen gesprekken. Begin met een losse gedachte.")}
              </p>
            )}
          </div>
        </aside>

        <section className="min-w-0 border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-950">
                {detail?.thread.title === "Nieuwe gedachten" ? t("Nieuwe gedachten") : detail?.thread.title || t("Schrijf alles op")}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{messageCountLabel}</p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!detail?.messages.length || summarizing}
              onClick={() => void summarize()}
            >
              {summarizing ? t("Samenvatten...") : t("Samenvatten")}
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
            <textarea
              value={draft}
              rows={6}
              className="block min-h-36 w-full resize-y rounded-t-2xl border-0 px-4 py-3 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
              placeholder={t("Schrijf hier je gedachte, idee, taak of planning-notitie...")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void saveThought();
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-3">
              <span className="text-xs text-slate-500">{t("Automatisch samenvatten na opslaan")}</span>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!draft.trim() || busy}
                onClick={() => void saveThought()}
              >
                {busy ? t("Opslaan...") : t("Opslaan")}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {detail?.messages.length ? detail.messages.map((message) => (
              <article key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.bodyText}</p>
                <p className="mt-2 text-xs text-slate-500">{formatShortDate(message.createdAt)}</p>
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-slate-800">{t("Waar is dit voor?")}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("Gebruik dit als tijdelijke plek voor ideeën, zorgen, taken en dagplanning voordat ze in je planner terechtkomen.")}
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="bg-blue-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-950">{t("Samenvatting")}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {t("Herschreven naar kern, acties, ideeën en planning.")}
              </p>
            </div>
            {latestSummary ? (
              <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
                {latestSummary.messageCount} {t("berichten")}
              </span>
            ) : null}
          </div>

          {latestSummary ? (
            <div className="mt-4 space-y-3">
              <section className="rounded-2xl border border-blue-200 bg-white p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t("Kern")}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-700">{latestSummary.content.overview}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {latestSummary.content.tasks.length} {t("acties")}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    {latestSummary.content.ideas.length} {t("ideeën")}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                    {latestSummary.content.planningNotes.length} {t("planningpunten")}
                  </span>
                </div>
              </section>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Acties")}</h4>
                <div className="mt-2 space-y-2">
                  {latestSummary.content.tasks.length ? latestSummary.content.tasks.map((item) => (
                    <div key={item} className="rounded-xl bg-slate-50 p-2.5">
                      <p className="text-sm leading-5 text-slate-800">{item}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                          value={taskDay}
                          onChange={(event) => setTaskDay(event.target.value as Weekday)}
                        >
                          {WEEKDAYS.map((weekday) => (
                            <option key={weekday} value={weekday}>
                              {weekdayLabels[weekday]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                          disabled={promotingTask === item}
                          onClick={() => {
                            setPromotingTask(item);
                            void onCreateTask(item, taskDay).finally(() => setPromotingTask(null));
                          }}
                        >
                          {promotingTask === item ? t("Toevoegen...") : t("Maak taak")}
                        </button>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-slate-500">{t("Geen taken gevonden.")}</p>
                  )}
                </div>
              </div>

              <SummaryList title={t("Ideeën")} items={latestSummary.content.ideas} emptyText={t("Geen ideeën gevonden.")} />
              <SummaryList
                title={t("Voor dagplanning")}
                items={latestSummary.content.planningNotes}
                emptyText={t("Geen planning-notities gevonden.")}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">{t("Nog geen samenvatting")}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("Sla een gedachte op en ik maak automatisch een compacte samenvatting met acties en ideeën.")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Voorbeeld output")}</h4>
                <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
                  <li className="rounded-xl bg-slate-50 p-2">{t("Kern: waar gaan je notities echt over?")}</li>
                  <li className="rounded-xl bg-slate-50 p-2">{t("Acties: wat kan direct naar de planner?")}</li>
                  <li className="rounded-xl bg-slate-50 p-2">{t("Ideeën: wat wil je bewaren zonder planningdruk?")}</li>
                </ul>
              </div>
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function SummaryList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.length ? items.map((item) => (
          <li key={item} className="rounded-lg bg-slate-50 px-2 py-2 text-sm text-slate-700">
            {item}
          </li>
        )) : (
          <li className="text-sm text-slate-500">{emptyText}</li>
        )}
      </ul>
    </div>
  );
}
