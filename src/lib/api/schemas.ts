import { z } from "zod";

export const weekdaySchema = z.enum(["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"]);
export const prioritySchema = z.enum(["hoog", "middel", "laag"]);
export const taskStatusSchema = z.enum(["open", "bezig", "klaar"]);

export const pinSchema = z.string().regex(/^\d{6}$/, "PIN moet exact 6 cijfers zijn");

export const taskCreateSchema = z.object({
  weekday: weekdaySchema,
  title: z.string().min(1).max(180),
  info: z.string().max(600).optional().default(""),
  deadlineAt: z.union([z.string(), z.null()]).optional().default(null),
  priority: prioritySchema.optional().default("middel"),
  status: taskStatusSchema.optional().default("open"),
  position: z.number().int().min(0).optional().default(0),
});

export const taskPatchSchema = z.object({
  weekday: weekdaySchema.optional(),
  title: z.string().min(1).max(180).optional(),
  info: z.string().max(600).optional(),
  deadlineAt: z.union([z.string(), z.null()]).optional(),
  priority: prioritySchema.optional(),
  status: taskStatusSchema.optional(),
  position: z.number().int().min(0).optional(),
  expectedUpdatedAt: z.string().min(1).optional(),
});

export const hourBlockCreateSchema = z.object({
  weekday: weekdaySchema,
  dayDate: z.string().date().nullable().optional().default(null),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
  taskText: z.string().max(300).optional().default(""),
  projectText: z.string().max(160).optional().default(""),
  deadlineAt: z.union([z.string(), z.null()]).optional().default(null),
  status: taskStatusSchema.optional().default("open"),
  position: z.number().int().min(0).optional().default(0),
  assignees: z.array(z.string().max(80)).optional().default([]),
});

export const hourBlockPatchSchema = z.object({
  weekday: weekdaySchema.optional(),
  dayDate: z.string().date().nullable().optional(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  taskText: z.string().max(300).optional(),
  projectText: z.string().max(160).optional(),
  deadlineAt: z.union([z.string(), z.null()]).optional(),
  status: taskStatusSchema.optional(),
  position: z.number().int().min(0).optional(),
  assignees: z.array(z.string().max(80)).optional(),
  expectedUpdatedAt: z.string().min(1).optional(),
});

export const hourEntryCreateSchema = z.object({
  dayDate: z.string().date(),
  weekday: weekdaySchema.optional(),
  hoursDecimal: z.coerce.number().positive().max(24),
  projectName: z.string().max(240).optional().default(""),
  noteText: z.string().max(4000).optional().default(""),
});

export const hourEntryPatchSchema = z.object({
  dayDate: z.string().date().optional(),
  weekday: weekdaySchema.optional(),
  hoursDecimal: z.coerce.number().positive().max(24).optional(),
  projectName: z.string().max(240).optional(),
  noteText: z.string().max(4000).optional(),
  expectedUpdatedAt: z.string().min(1).optional(),
});

export const weekUpsertSchema = z.object({
  weekKey: z.string().min(1),
  weekLabel: z.string().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  sourceFileName: z.string().nullable().optional(),
  sourceFileId: z.string().nullable().optional(),
  sourceModifiedAt: z.string().datetime().nullable().optional(),
});

export const importSyncSchema = z.object({
  force: z.boolean().optional().default(false),
});
