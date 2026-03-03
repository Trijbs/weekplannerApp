import { formatIsoToLocalInput } from "@/lib/db/helpers";
import type { DayTask, HourEntry, Weekday } from "@/lib/db/types";
import type { DetailTaskFormState, HourBlockDisplayGroup } from "@/components/weekplanner/types";

type DayDetailModalProps = {
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
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 p-3 sm:p-6" onClick={onClose}>
      <div
        className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Dag detail</p>
            <h2 className="text-xl font-semibold text-slate-900">
              {weekdayLabels[detailDay]}
              {detailDayIso ? (
                <span className="ml-2 text-base font-normal text-slate-500">
                  ({detailDayLabel ?? formatDayDateLabel(detailDayIso)})
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Taken {detailDoneCount}/{detailTasks.length} klaar • Uurblokken {detailHourBlocksCount} • Uren {detailHoursTotal}u
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {weekLabel} • Live: {liveNowAmsterdam}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Sluiten
          </button>
        </div>

        <div className="grid auto-rows-fr gap-4 overflow-auto p-4 sm:grid-cols-3 sm:p-6">
          <section className="flex min-h-[24rem] flex-col rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Taken</h3>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Snelle taak voor {weekdayLabels[detailDay]}
                  {detailDayIso ? ` (${detailDayLabel ?? formatDayDateLabel(detailDayIso)})` : ""}
                </p>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-white"
                  onClick={onToggleComposer}
                >
                  {detailTaskComposerExpanded ? "Minder opties" : "Meer opties"}
                </button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,1.15fr)_auto]">
                <input
                  value={detailTaskForm.title}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Nieuwe taak"
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
                  <option value="">Beste uren</option>
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
                  Toevoegen
                </button>
              </div>

              {detailTaskComposerExpanded ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
                  <input
                    value={detailTaskForm.info}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="Info of project"
                    onChange={(event) => onDetailTaskFormChange({ info: event.target.value })}
                  />
                  <select
                    value={detailTaskForm.priority}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    onChange={(event) =>
                      onDetailTaskFormChange({ priority: event.target.value as DetailTaskFormState["priority"] })
                    }
                  >
                    <option value="hoog">Hoog</option>
                    <option value="middel">Middel</option>
                    <option value="laag">Laag</option>
                  </select>
                  <select
                    value={detailTaskDeadlineTimeValue}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    onChange={(event) => onApplyDetailTaskDeadlineTime(event.target.value)}
                  >
                    <option value="">Sneltijd deadline</option>
                    {timeOptions.map((time) => (
                      <option key={`detail-task-deadline-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
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
                              "Taak status bijgewerkt.",
                            )
                          }
                          className="h-4 w-4"
                        />
                        Afvinken
                      </label>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => void onTaskDelete(task.id)}
                      >
                        Verwijder
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
                            "Taak bijgewerkt.",
                          )
                        }
                      />
                      <input
                        key={`${task.id}-${task.updatedAt}-detail-info`}
                        defaultValue={task.info}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
                        placeholder="Info"
                        onBlur={(event) =>
                          void onTaskPatch(
                            task.id,
                            { info: event.target.value, expectedUpdatedAt: task.updatedAt },
                            "Info bijgewerkt.",
                          )
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          key={`${task.id}-${task.updatedAt}-detail-priority`}
                          defaultValue={task.priority}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          onChange={(event) =>
                            void onTaskPatch(
                              task.id,
                              { priority: event.target.value, expectedUpdatedAt: task.updatedAt },
                              "Prioriteit bijgewerkt.",
                            )
                          }
                        >
                          <option value="hoog">Hoog</option>
                          <option value="middel">Middel</option>
                          <option value="laag">Laag</option>
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
                              "Deadline bijgewerkt.",
                            )
                          }
                        />
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">Geen taken voor deze dag.</p>
              )}
            </div>
          </section>

          <section className="flex min-h-[24rem] flex-col rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Uurblokken</h3>
            {detailDayIsToday ? <p className="mt-1 text-xs text-blue-700">Realtime: {liveNowAmsterdam}</p> : null}
            <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
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
                        {formatHourAmount(blockGroup.totalMinutes / 60)} • {blockGroup.blocks.length} blok
                        {blockGroup.blocks.length === 1 ? "" : "ken"}
                        {blockGroup.taskLabels.length > 1 ? ` • ${blockGroup.taskLabels.join(", ")}` : ""}
                      </p>
                      {isActiveNow ? (
                        <span className="mt-2 inline-flex rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          Nu actief
                        </span>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">Geen uurblokken voor deze dag.</p>
              )}
            </div>
          </section>

          <section className="flex min-h-[24rem] flex-col rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Urenregistratie</h3>
            <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
              {detailHourEntries.length ? (
                detailHourEntries.map((entry) => (
                  <article key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <p className="text-sm font-medium text-slate-800">{entry.hoursDecimal}u</p>
                    <p className="text-sm text-slate-600">
                      {entry.projectName || "Onbekend project"} • {entry.noteText || "Geen notitie"}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">Geen urenregistratie voor deze dag.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
