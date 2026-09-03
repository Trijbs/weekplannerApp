"use client";

import { useMemo } from "react";
import type { WidgetProps } from "../types";

const MONTHS = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday start
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function AgendaWidget({ instance }: WidgetProps) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-sm font-semibold text-slate-900">
        {MONTHS[month]} {year}
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
          <span
            key={d}
            className="py-1 text-center text-[10px] font-medium text-slate-400"
          >
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`flex h-7 items-center justify-center rounded-md text-xs ${
              day === today
                ? "bg-blue-600 font-bold text-white"
                : day !== null
                  ? "text-slate-700"
                  : ""
            }`}
          >
            {day ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}
