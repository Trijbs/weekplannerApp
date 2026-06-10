import { formatIsoToLocalInput } from "@/lib/db/helpers";
import type { DayTask, HourEntry, Weekday } from "@/lib/db/types";
import type { DetailTaskFormState, HourBlockDisplayGroup } from "@/components/weekplanner/types";
import type { AppLanguage } from "@/lib/i18n";
import { translateStatic } from "@/lib/i18n";
import { AnimatedDeleteButton } from "@/components/weekplanner/AnimatedDeleteButton";

const ASSIGNEE_COLORS = [
  { bg: "#dbeafe", border: "#bfdbfe", text: "#1d4ed8", avatar: "#2563eb" },
  { bg: "#ede9fe", border: "#ddd6fe", text: "#6d28d9", avatar: "#7c3aed" },
  { bg: "#d1fae5", border: "#a7f3d0", text: "#065f46", avatar: "#059669" },
  { bg: "#fee2e2", border: "#fecaca", text: "#991b1b", avatar: "#dc2626" },
  { bg: "#fef3c7", border: "#fde68a", text: "#92400e", avatar: "#d97706" },
  { bg: "#fce7f3", border: "#fbcfe8", text: "#9d174d", avatar: "#db2777" },
] as const;

function assigneeColorFor(name: string): (typeof ASSIGNEE_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return ASSIGNEE_COLORS[hash % ASSIGNEE_COLORS.length];
}

function priorityBorderClass(priority: string): string {
  if (priority === "hoog") return "border-l-4 border-l-red-400";
  if (priority === "middel") return "border-l-4 border-l-amber-400";
  return "border-l-4 border-l-slate-300";
}

function statusBadgeClass(status: string): string {
  if (status === "klaar") return "bg-green-100 text-green-700";
  if (status === "bezig") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-500";
}

function assigneeInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

type DayDetailModalProps = {
  language: AppLanguage;
  weekdayLabels: Record<Weekday, string>;
  detailDay: Weekday;
  detailDayIso: string | null;
  detailDayLabel: string | null;
  weekLabel: string;
  liveNowAmsterdam: string;
  detailDoneCount: number;
  detailTasks: DayTask[];
  detailHourBlocksCount: number;
  detailHoursTotal: number;
  detailTaskForm: DetailTaskFormState;
  detailTaskComposerExpanded: boolean;
  detailScheduleOptions: string[];
  detailTaskDeadlineTimeValue: string;
  detailGroupedHourBlocks: HourBlockDisplayGroup[];
  detailHourEntries: HourEntry[];
  detailDayIsToday: boolean;
  nowMinutesAmsterdam: number | null;
  timeOptions: string[];
  formatHourAmount: (hours: number) => string;
  isNowInsideBlock: (timeStart: string, timeEnd: string, nowMinutes: number | null) => boolean;
  formatDayDateLabel: (isoDate: string) => string;
  localInputToTimezoneIso: (localValue: string, timeZone: string) => string | null;
  onClose: () => void;
  onToggleComposer: () => void;
  onDetailTaskFormChange: (patch: Partial<DetailTaskFormState>) => void;
  onApplyDetailTaskDeadlineTime: (value: string) => void;
  onAddTask: () => unknown;
  onTaskPatch: (taskId: string, body: Record<string, unknown>, successMessage: string) => unknown;
  onTaskDelete: (taskId: string) => unknown;
  onNavigateToThought?: (threadId: string) => void;
};

export function DayDetailModal({
  language,
  weekdayLabels,
  detailDay,
  detailDayIso,
  detailDayLabel,
  weekLabel,
  liveNowAmsterdam,
  detailDoneCount,
  detailTasks,
  detailHourBlocksCount,
  detailHoursTotal,
  detailTaskForm,
  detailTaskComposerExpanded,
  detailScheduleOptions,
  detailTaskDeadlineTimeValue,
  detailGroupedHourBlocks,
  detailHourEntries,
  detailDayIsToday,
  nowMinutesAmsterdam,
  timeOptions,
  formatHourAmount,
  isNowInsideBlock,
  formatDayDateLabel,
  localInputToTimezoneIso,
  onClose,
  onToggleComposer,
  onDetailTaskFormChange,
  onApplyDetailTaskDeadlineTime,
  onAddTask,
  onTaskPatch,
  onTaskDelete,
  onNavigateToThought,
}: DayDetailModalProps) {
  const t = (text: string) => translateStatic(language, text);

  const summary =
    language === "en"
      ? `Tasks ${detailDoneCount}/${detailTasks.length} done • Time blocks ${detailHourBlocksCount} • Hours ${detailHoursTotal}h`
      : `Taken ${detailDoneCount}/${detailTasks.length} klaar • Uurblokken ${detailHourBlocksCount} • Uren ${detailHoursTotal}u`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-0 sm:p-6" onClick={onClose}>
      <div
        className="mx-auto flex h-[100dvh] w-full max-w-4xl flex-col overflow-y-auto bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:rounded-2xl lg:overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{t("Dag detail")}</p>
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              {weekdayLabels[detailDay]}
              {detailDayIso ? (
                <span className="ml-2 text-base font-normal text-slate-500">
                  ({detailDayLabel ?? formatDayDateLabel(detailDayIso)})
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{summary}</p>
            <p className="mt-1 text-xs text-slate-500">
              {weekLabel} • {t("Realtime")}: {liveNowAmsterdam}
            </p>
          </div>
          <button
            type="button"
            className="self-start rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 sm:self-auto"
            onClick={onClose}
          >
            {t("Sluiten")}
          </button>
        </div>

        <div className="grid gap-3 p-3 lg:auto-rows-fr lg:grid-cols-3 lg:gap-4 lg:overflow-auto lg:p-6">
          <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 p-3 lg:min-h-[24rem]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{t("Taken")}</h3>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-700"
                onClick={onToggleComposer}
              >
                {detailTaskComposerExpanded ? t("Annuleer") : t("+ Nieuw")}
              </button>
            </div>

            {detailTaskComposerExpanded ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,1.15fr)_auto]">
                  <input
                    autoFocus
                    value={detailTaskForm.title}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder={t("Nieuwe taak")}
                    onChange={(event) => onDetailTaskFormChange({ title: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void onAddTask();
                      }
                    }}
                  />
                  <select
                    value={detailTaskForm.scheduleHint}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    onChange={(event) => onDetailTaskFormChange({ scheduleHint: event.target.value })}
                  >
                    <option value="">{t("Beste uren")}</option>
                    {detailScheduleOptions.map((slot) => (
                      <option key={`detail-slot-${slot}`} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={detailTaskForm.deadlineAt}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    onChange={(event) => onDetailTaskFormChange({ deadlineAt: event.target.value })}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void onAddTask()}
                    disabled={!detailTaskForm.title.trim()}
                  >
                    {t("Toevoegen")}
                  </button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
                  <input
                    value={detailTaskForm.info}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder={t("Info of project")}
                    onChange={(event) => onDetailTaskFormChange({ info: event.target.value })}
                  />
                  <select
                    value={detailTaskForm.priority}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    onChange={(event) =>
                      onDetailTaskFormChange({ priority: event.target.value as DetailTaskFormState["priority"] })
                    }
                  >
                    <option value="hoog">{t("Hoog")}</option>
                    <option value="middel">{t("Middel")}</option>
                    <option value="laag">{t("Laag")}</option>
                  </select>
                  <select
                    value={detailTaskDeadlineTimeValue}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    onChange={(event) => onApplyDetailTaskDeadlineTime(event.target.value)}
                  >
                    <option value="">{t("Sneltijd deadline")}</option>
                    {timeOptions.map((time) => (
                      <option key={`detail-task-deadline-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1">
              {detailTasks.length ? (
                detailTasks.map((task) => (
                  <article
                    key={task.id}
                    className={`rounded-lg border border-slate-100 bg-slate-50 p-2 ${priorityBorderClass(task.priority)} overflow-hidden`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={task.status === "klaar"}
                          onChange={(event) =>
                            void onTaskPatch(
                              task.id,
                              {
                                status: event.target.checked ? "klaar" : "open",
                                expectedUpdatedAt: task.updatedAt,
                              },
                              t("Taak status bijgewerkt."),
                            )
                          }
                          className="h-4 w-4"
                        />
                        {language === "en" ? "Mark done" : "Afvinken"}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(task.status)}`}>
                          {task.status === "klaar" ? t("Klaar") : task.status === "bezig" ? t("Bezig") : t("Open")}
                        </span>
                        <AnimatedDeleteButton
                          onConfirm={() => void onTaskDelete(task.id)}
                          label={t("Verwijder")}
                          confirmLabel={t("Zeker?")}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      <input
                        key={`${task.id}-${task.updatedAt}-detail-title`}
                        defaultValue={task.title}
                        className={`w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none transition-colors focus:border-amber-400 focus:ring-1 focus:ring-amber-300 ${
                          task.status === "klaar" ? "text-slate-400 line-through" : "text-slate-800"
                        }`}
                        onBlur={(event) =>
                          void onTaskPatch(
                            task.id,
                            { title: event.target.value, expectedUpdatedAt: task.updatedAt },
                            t("Taak bijgewerkt."),
                          )
                        }
                      />
                      {task.threadId ? (
                        <button
                          type="button"
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline cursor-pointer"
                          onClick={() => onNavigateToThought?.(task.threadId!)}
                        >
                          {language === "en" ? "Source: thought" : "Bron: gedachte"}
                        </button>
                      ) : null}
                      <input
                        key={`${task.id}-${task.updatedAt}-detail-info`}
                        defaultValue={task.info}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none transition-colors focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                        placeholder={t("Info")}
                        onBlur={(event) =>
                          void onTaskPatch(
                            task.id,
                            { info: event.target.value, expectedUpdatedAt: task.updatedAt },
                            t("Info bijgewerkt."),
                          )
                        }
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <select
                          key={`${task.id}-${task.updatedAt}-detail-priority`}
                          defaultValue={task.priority}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none transition-colors focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                          onChange={(event) =>
                            void onTaskPatch(
                              task.id,
                              { priority: event.target.value, expectedUpdatedAt: task.updatedAt },
                              t("Prioriteit bijgewerkt."),
                            )
                          }
                        >
                          <option value="hoog">{t("Hoog")}</option>
                          <option value="middel">{t("Middel")}</option>
                          <option value="laag">{t("Laag")}</option>
                        </select>
                        <input
                          key={`${task.id}-${task.updatedAt}-detail-deadline`}
                          type="datetime-local"
                          defaultValue={formatIsoToLocalInput(task.deadlineAt)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none transition-colors focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                          onBlur={(event) =>
                            void onTaskPatch(
                              task.id,
                              {
                                deadlineAt: event.target.value
                                  ? localInputToTimezoneIso(event.target.value, "Europe/Amsterdam")
                                  : null,
                                expectedUpdatedAt: task.updatedAt,
                              },
                              t("Deadline bijgewerkt."),
                            )
                          }
                        />
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="text-2xl">📋</span>
                  <p className="text-sm font-medium text-slate-600">{t("Geen taken voor deze dag.")}</p>
                  <p className="text-xs text-slate-400">{language === "en" ? "Add one with + New above" : "Voeg er een toe via + Nieuw"}</p>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 p-3 lg:min-h-[24rem]">
            <h3 className="text-sm font-semibold text-slate-900">{t("Uurblokken")}</h3>
            {detailDayIsToday ? <p className="mt-1 text-xs text-blue-700">{t("Realtime")}: {liveNowAmsterdam}</p> : null}
            <div className="mt-2 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1">
              {detailGroupedHourBlocks.length ? (
                detailGroupedHourBlocks.map((blockGroup) => {
                  const isActiveNow =
                    detailDayIsToday &&
                    blockGroup.blocks.some((block) => isNowInsideBlock(block.timeStart, block.timeEnd, nowMinutesAmsterdam));

                  return (
                    <article
                      key={blockGroup.key}
                      className={`rounded-lg border p-2.5 transition-colors ${
                        isActiveNow
                          ? "border-l-4 border-green-400 border-t-green-200 border-r-green-200 border-b-green-200 bg-green-50 ring-1 ring-green-200"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">{blockGroup.label}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {blockGroup.timeStart} - {blockGroup.timeEnd}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatHourAmount(blockGroup.totalMinutes / 60)} • {blockGroup.blocks.length} {language === "en"
                          ? `block${blockGroup.blocks.length === 1 ? "" : "s"}`
                          : `blok${blockGroup.blocks.length === 1 ? "" : "ken"}`}
                        {blockGroup.taskLabels.length > 1 ? ` • ${blockGroup.taskLabels.join(", ")}` : ""}
                      </p>
                      {isActiveNow ? (
                        <span className="mt-2 inline-flex animate-pulse items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          {t("Nu actief")}
                        </span>
                      ) : null}
                      {blockGroup.assignees.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {blockGroup.assignees.map((name) => {
                            const color = assigneeColorFor(name);
                            return (
                              <span
                                key={name}
                                className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
                                style={{ background: color.bg, border: `1px solid ${color.border}` }}
                              >
                                <span
                                  className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
                                  style={{ background: color.avatar }}
                                >
                                  {assigneeInitials(name)}
                                </span>
                                <span className="text-[10px] font-medium" style={{ color: color.text }}>
                                  {name}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="text-2xl">🕐</span>
                  <p className="text-sm font-medium text-slate-600">{t("Geen uurblokken voor deze dag.")}</p>
                  <p className="text-xs text-slate-400">{language === "en" ? "Schedule blocks in the Blocks tab" : "Plan blokken via het Uurblokken-tabblad"}</p>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 p-3 lg:min-h-[24rem]">
            <h3 className="text-sm font-semibold text-slate-900">{t("Urenregistratie")}</h3>
            <div className="mt-2 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1">
              {detailHourEntries.length ? (
                detailHourEntries.map((entry) => (
                  <article key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <p className="text-sm font-medium text-slate-800">{entry.hoursDecimal}u</p>
                    <p className="text-sm text-slate-600">
                      {entry.projectName || t("Onbekend project")} • {entry.noteText || t("Geen notitie")}
                    </p>
                  </article>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="text-2xl">⏱️</span>
                  <p className="text-sm font-medium text-slate-600">
                    {language === "en" ? "No time entries for this day." : "Geen urenregistratie voor deze dag."}
                  </p>
                  <p className="text-xs text-slate-400">{language === "en" ? "Log hours in the Hours tab" : "Registreer uren via het Uren-tabblad"}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
