import type { DatabaseRepository } from "@/lib/db/repository.interface";
import { localDb } from "@/lib/db/repository.local";
import { hasNeonConfig, neonDb } from "@/lib/db/repository.neon";
import { hasSupabaseConfig, supabaseDb } from "@/lib/db/repository.supabase";

export const db: DatabaseRepository = hasNeonConfig()
  ? neonDb
  : hasSupabaseConfig()
    ? supabaseDb
    : localDb;
