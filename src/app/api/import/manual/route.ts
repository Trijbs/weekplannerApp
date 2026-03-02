import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { importWorkbookBuffer } from "@/lib/import/sync";

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return fail("Geen bestand ontvangen.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importWorkbookBuffer({
      buffer,
      fileName: file.name,
      provider: "manual",
      sourceFileId: null,
      sourceModifiedAt: null,
    });

    return ok(result);
  } catch (error) {
    return parseError(error);
  }
}
