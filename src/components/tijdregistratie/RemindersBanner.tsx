"use client";

import type { TimeReminder } from "@/lib/time/tracking";
import { formatHoursAsDuration } from "@/lib/time/tracking";

type RemindersBannerProps = {
  reminders: TimeReminder[];
  onRegister: (reminder: TimeReminder) => void;
  onDismiss: (reminder: TimeReminder) => void;
  t: (text: string) => string;
};

export function RemindersBanner({ reminders, onRegister, onDismiss, t }: RemindersBannerProps) {
  if (reminders.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        {reminders.length === 1
          ? t("1 item zonder tijdregistratie.")
          : `${reminders.length} ${t("items zonder tijdregistratie.")}`}
      </p>
      <ul className="space-y-1.5">
        {reminders.map((reminder) => (
          <li
            key={`${reminder.kind}-${reminder.entityId}`}
            className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900"
          >
            <span className="min-w-0 truncate">
              {reminder.kind === "task-zonder-uren" ? t("Afgeronde taak") : t("Verstreken uurblok")}:{" "}
              <span className="font-medium">{reminder.title}</span>
              {reminder.suggestedHours ? ` (${formatHoursAsDuration(reminder.suggestedHours)})` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-amber-900 px-2.5 py-1 text-xs text-white hover:bg-amber-800"
                onClick={() => onRegister(reminder)}
              >
                {t("Nu registreren")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
                onClick={() => onDismiss(reminder)}
              >
                {t("Later")}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
