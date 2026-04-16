import { formatIsoToLocalInput } from "@/lib/db/helpers";
import type { DayTask, HourEntry, Weekday } from "@/lib/db/types";
import type { DetailTaskFormState, HourBlockDisplayGroup } from "@/components/weekplanner/types";
import type { AppLanguage } from "@/lib/i18n";
import { translateStatic } from "@/lib/i18n";

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
            <h3 className="text-sm font-semibold text-slate-900">{t("Taken")}</h3>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  {t("Snelle taak voor")} {weekdayLabels[detailDay]}
                  {detailDayIso ? ` (${detailDayLabel ?? formatDayDateLabel(detailDayIso)})` : ""}
                </p>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-white"
                  onClick={onToggleComposer}
                >
                  {detailTaskComposerExpanded ? t("Minder opties") : t("Meer opties")}
                </button>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,1.15fr)_auto]">
                <input
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

              {detailTaskComposerExpanded ? (
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
              ) : null}
            </div>

            <div className="mt-3 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1">
              {detailTasks.length ? (
                detailTasks.map((task) => (
                  <article key={task.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
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
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => void onTaskDelete(task.id)}
                      >
                        {t("Verwijder")}
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      <input
                        key={`${task.id}-${task.updatedAt}-detail-title`}
                        defaultValue={task.title}
                        className={`w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm ${
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
                      <input
                        key={`${task.id}-${task.updatedAt}-detail-info`}
                        defaultValue={task.info}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
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
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
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
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
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
                <p className="text-sm text-slate-500">{t("Geen taken voor deze dag.")}</p>
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
                        isActiveNow ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200" : "border-slate-100 bg-slate-50"
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
                        <span className="mt-2 inline-flex rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {t("Nu actief")}
                        </span>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">{t("Geen uurblokken voor deze dag.")}</p>
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
                <p className="text-sm text-slate-500">
                  {language === "en" ? "No time entries for this day." : "Geen urenregistratie voor deze dag."}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
