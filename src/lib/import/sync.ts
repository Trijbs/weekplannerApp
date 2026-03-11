import { db } from "@/lib/db/repository";
import { listCandidateFiles, downloadDriveFile } from "@/lib/import/google-drive";
import { parseWeekplanningCsv } from "@/lib/import/csv-parser";
import { parseWeekplanningWorkbook } from "@/lib/import/excel-parser";

export interface ImportResult {
  weekId: string;
  weekKey: string;
  createdCount: number;
  updatedCount: number;
  blockCreated: number;
  blockUpdated: number;
  warnings: string[];
}

export async function importWorkbookBuffer(params: {
  buffer: Buffer;
  fileName: string;
  sourceFileId?: string | null;
  sourceModifiedAt?: string | null;
  provider: "manual" | "google-drive";
}): Promise<ImportResult> {
  const job = await db.startImportJob(params.provider, params.fileName, params.sourceFileId ?? null, "import");

  try {
    const parsed = params.fileName.toLowerCase().endsWith(".csv")
      ? await parseWeekplanningCsv(params.buffer, params.fileName)
      : await parseWeekplanningWorkbook(params.buffer, params.fileName);
    const existingByRange = (await db.listWeeks()).find(
      (week) => week.startDate === parsed.startDate && week.endDate === parsed.endDate,
    );

    const week = await db.upsertWeek({
      weekKey: existingByRange?.weekKey ?? parsed.weekKey,
      weekLabel: parsed.weekLabel,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      sourceFileName: params.fileName,
      sourceFileId: params.sourceFileId ?? null,
      sourceModifiedAt: params.sourceModifiedAt ?? null,
    });

    const changes = await db.upsertImportedData(week.id, {
      tasks: parsed.tasks,
      hourBlocks: parsed.hourBlocks,
    });

    await db.finishImportJob(job.id, "success", {
      weekId: week.id,
      weekKey: week.weekKey,
      taskCreated: changes.taskCreated,
      taskUpdated: changes.taskUpdated,
      blockCreated: changes.blockCreated,
      blockUpdated: changes.blockUpdated,
      warnings: parsed.warnings,
    });

    return {
      weekId: week.id,
      weekKey: week.weekKey,
      createdCount: changes.taskCreated,
      updatedCount: changes.taskUpdated,
      blockCreated: changes.blockCreated,
      blockUpdated: changes.blockUpdated,
      warnings: parsed.warnings,
    };
  } catch (error) {
    await db.finishImportJob(job.id, "failed", {
      reason: error instanceof Error ? error.message : "Onbekende fout",
    });
    throw error;
  }
}

export async function syncGoogleDrive(): Promise<{
  imported: ImportResult[];
  skipped: number;
}> {
  const files = await listCandidateFiles();

  const imported: ImportResult[] = [];
  let skipped = 0;

  for (const file of files) {
    const already = await db.getWeekBySourceVersion(file.id, file.modifiedTime);
    if (already) {
      skipped += 1;
      continue;
    }

    const buffer = await downloadDriveFile(file.id);
    const result = await importWorkbookBuffer({
      buffer,
      fileName: file.name,
      sourceFileId: file.id,
      sourceModifiedAt: file.modifiedTime,
      provider: "google-drive",
    });

    imported.push(result);
  }

  return { imported, skipped };
}
