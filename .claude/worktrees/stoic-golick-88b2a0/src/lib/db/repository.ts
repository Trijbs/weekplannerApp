import type { DatabaseRepository } from "@/lib/db/repository.interface";
import { localDb } from "@/lib/db/repository.local";
import { hasNeonConfig, neonDb } from "@/lib/db/repository.neon";

function shouldUseLocalDb(): boolean {
  if (hasNeonConfig()) {
    return false;
  }

  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production";

  if (isProduction) {
    throw new Error("DATABASE_URL ontbreekt in productie. Configureer de Neon connectiestring in Vercel.");
  }

  return true;
}

function getRepository(): DatabaseRepository {
  return shouldUseLocalDb() ? localDb : neonDb;
}

export const db: DatabaseRepository = new Proxy({} as DatabaseRepository, {
  get(_target, property) {
    const repository = getRepository();
    const value = repository[property as keyof DatabaseRepository];

    if (typeof value === "function") {
      return value.bind(repository);
    }

    return value;
  },
});
