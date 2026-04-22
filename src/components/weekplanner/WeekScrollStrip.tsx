"use client";

type WeekOption = {
  id: string;
  label: string;
  rangeText: string;
};

type WeekScrollStripProps = {
  weekOptions: WeekOption[];
  currentWeekId: string | null;
  onWeekSelect: (weekId: string) => void;
};

export function WeekScrollStrip({ weekOptions, currentWeekId, onWeekSelect }: WeekScrollStripProps) {
  if (weekOptions.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {weekOptions.map((week) => {
        const isActive = week.id === currentWeekId;
        return (
          <button
            key={week.id}
            type="button"
            onClick={() => onWeekSelect(week.id)}
            className={`shrink-0 rounded-2xl border px-4 py-2.5 text-left transition-all ${
              isActive
                ? "border-blue-600 bg-blue-600 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide">
              {week.label}
            </p>
            <p className={`mt-0.5 text-[11px] ${isActive ? "text-blue-100" : "text-slate-500"}`}>
              {week.rangeText}
            </p>
          </button>
        );
      })}
    </div>
  );
}
