"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectBudget } from "@/lib/db/types";
import { budgetStatus, formatHoursAsDuration, type BudgetLevel } from "@/lib/time/tracking";

type ProjectBudgetsProps = {
  /** Verandert wanneer de urendata is bijgewerkt, zodat totalen opnieuw laden. */
  refreshToken: string;
  t: (text: string) => string;
};

type ProjectTotal = { projectName: string; totalHours: number };

const LEVEL_STYLES: Record<BudgetLevel, { dot: string; bar: string; text: string }> = {
  groen: { dot: "🟢", bar: "bg-emerald-500", text: "text-emerald-700" },
  geel: { dot: "🟡", bar: "bg-amber-500", text: "text-amber-700" },
  rood: { dot: "🔴", bar: "bg-red-500", text: "text-red-700" },
};

export function ProjectBudgets({ refreshToken, t }: ProjectBudgetsProps) {
  const [budgets, setBudgets] = useState<ProjectBudget[]>([]);
  const [totals, setTotals] = useState<ProjectTotal[]>([]);
  const [formProject, setFormProject] = useState("");
  const [formHours, setFormHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/project-budgets", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const json = (await response.json()) as {
        data?: { budgets: ProjectBudget[]; totals: ProjectTotal[] };
      };
      setBudgets(json.data?.budgets ?? []);
      setTotals(json.data?.totals ?? []);
    } catch {
      // Offline of netwerkfout: bestaande weergave laten staan.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const saveBudget = useCallback(async () => {
    const budgetHours = Number(formHours);
    if (!formProject.trim() || !Number.isFinite(budgetHours) || budgetHours <= 0) {
      setError(t("Vul een projectnaam en een budget in uren in."));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/project-budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: formProject.trim(), budgetHours }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? t("Budget opslaan mislukt."));
      }
      setFormProject("");
      setFormHours("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Budget opslaan mislukt."));
    } finally {
      setSaving(false);
    }
  }, [formHours, formProject, load, t]);

  const removeBudget = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/project-budgets/${id}`, { method: "DELETE" });
        await load();
      } catch {
        // stil: volgende load herstelt de weergave
      }
    },
    [load],
  );

  const totalsByProject = new Map(totals.map((item) => [item.projectName.toLowerCase(), item.totalHours]));

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Projectbudgetten")}</p>

      {budgets.length === 0 ? (
        <p className="text-sm text-slate-500">{t("Nog geen budgetten ingesteld.")}</p>
      ) : (
        <ul className="space-y-2">
          {budgets.map((budget) => {
            const usedHours = totalsByProject.get(budget.projectName.toLowerCase()) ?? 0;
            const status = budgetStatus(usedHours, budget.budgetHours);
            const style = LEVEL_STYLES[status.level];
            const statusText =
              status.level === "groen"
                ? t("Op schema")
                : status.level === "geel"
                  ? `${formatHoursAsDuration(status.remainingHours)} ${t("beschikbaar")}`
                  : `${formatHoursAsDuration(status.overHours)} ${t("boven budget")}`;

            return (
              <li key={budget.id} className="rounded-xl border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{budget.projectName}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${style.text}`}>
                      {style.dot} {statusText}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-red-600"
                      aria-label={t("Budget verwijderen")}
                      onClick={() => void removeBudget(budget.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${style.bar}`}
                      style={{ width: `${Math.min(100, status.usagePct)}%` }}
                    />
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-slate-600">
                    {status.usedHours} / {status.budgetHours} {t("uur")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-xs text-slate-500">{t("Project")}</span>
          <input
            value={formProject}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder={t("Project / categorie")}
            onChange={(event) => setFormProject(event.target.value)}
          />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs text-slate-500">{t("Budget (uren)")}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={formHours}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onChange={(event) => setFormHours(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving}
          onClick={() => void saveBudget()}
        >
          {t("Budget opslaan")}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
