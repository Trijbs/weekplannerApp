import type { DatabaseRepository } from "@/lib/db/repository.interface";
import { localDb } from "@/lib/db/repository.local";
import { hasNeonConfig, neonDb } from "@/lib/db/repository.neon";

export const db: DatabaseRepository = hasNeonConfig()
  ? neonDb
  : localDb;
