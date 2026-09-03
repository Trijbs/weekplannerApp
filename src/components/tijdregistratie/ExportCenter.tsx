"use client";

import { useMemo, useState } from "react";

type ExportPeriod = "dag" | "week" | "maand" | "alles" | "bereik";

type ExportCenterProps = {
  todayIso: string | null;
  weekStartDate: string;
  weekEndDate: string;
  projectNames: string[];
  t: (text: string) => string;
};

function monthRange(todayIso: string): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

export function ExportCenter({ todayIso, weekStartDate, weekEndDate, projectNames, t }: ExportCenterProps) {
  const [period, setPeriod] = useState<ExportPeriod>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [project, setProject] = useState("");

  const range = useMemo((): { from: string | null; to: string | null } => {
    if (period === "alles") {
      return { from: null, to: null };
    }
    if (period === "bereik") {
      return { from: customFrom || null, to: customTo || null };
    }
    if (!todayIso) {
      return { from: null, to: null };
    }
    if (period === "dag") {
      return { from: todayIso, to: todayIso };
    }
    if (period === "maand") {
      return monthRange(todayIso);
    }
    return { from: weekStartDate, to: weekEndDate };
  }, [customFrom, customTo, period, todayIso, weekEndDate, weekStartDate]);

  const buildUrl = (format: "xlsx" | "csv" | "pdf"): string => {
    const params = new URLSearchParams({ format });
    if (range.from) {
      params.set("from", range.from);
    }
    if (range.to) {
      params.set("to", range.to);
    }
    if (project) {
      params.set("project", project);
    }
    return `/api/export/hours?${params.toString()}`;
  };

  const periods: Array<{ key: ExportPeriod; label: string }> = [
    { key: "dag", label: t("Vandaag") },
    { key: "week", label: t("Deze week") },
    { key: "maand", label: t("Deze maand") },
    { key: "alles", label: t("Alles") },
    { key: "bereik", label: t("Eigen bereik") },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Exportcentrum")}</p>
      <div className="flex flex-wrap gap-2">
        {periods.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-xl px-3 py-1.5 text-sm ${
              period === item.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            onClick={() => setPeriod(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {period === "bereik" ? (
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={customFrom}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
            onChange={(event) => setCustomFrom(event.target.value)}
          />
          <input
            type="date"
            value={customTo}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
            onChange={(event) => setCustomTo(event.target.value)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={project}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
          onChange={(event) => setProject(event.target.value)}
        >
          <option value="">{t("Alle projecten")}</option>
          {projectNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {(["pdf", "xlsx", "csv"] as const).map((format) => (
          <a
            key={format}
            href={buildUrl(format)}
            download
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            ⬇ {format.toUpperCase()}
          </a>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {t("Voor stageverslagen, klantverantwoording, administratie en facturatie.")}
      </p>
    </div>
  );
}
