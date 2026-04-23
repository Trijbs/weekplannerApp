import fs from "node:fs/promises";
import path from "node:path";
import { neon } from "@netlify/neon";

const DB_ENV_NAMES = ["DATABASE_URL"];

function stripLineComments(sqlText) {
  return sqlText
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("--")) {
        return "";
      }
      return line;
    })
    .join("\n");
}

function splitStatements(sqlText) {
  return sqlText
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function loadDatabaseUrlFromEnvFile() {
  const envFile = path.resolve(process.cwd(), ".env.local");
  const text = await fs.readFile(envFile, "utf8");
  const lines = text.split("\n").map((entry) => entry.trim());

  for (const envName of DB_ENV_NAMES) {
    const line = lines.find((entry) => entry.startsWith(`${envName}=`));
    if (!line) {
      continue;
    }
    const value = line.slice(envName.length + 1).trim();
    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

async function main() {
  const existingUrl = process.env.DATABASE_URL ?? null;

  if (!existingUrl) {
    const fromFile = await loadDatabaseUrlFromEnvFile().catch(() => null);
    if (!fromFile) {
      throw new Error("DATABASE_URL ontbreekt. Zet die eerst in .env.local of runtime env vars.");
    }
    process.env.DATABASE_URL = fromFile;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const sql = neon(databaseUrl);

  const migrationsDir = path.resolve(process.cwd(), "db/migrations");
  const entries = await fs.readdir(migrationsDir);
  const sqlFiles = entries
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(migrationsDir, f));

  let totalExecuted = 0;
  for (const filePath of sqlFiles) {
    const fileName = path.basename(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    const prepared = stripLineComments(raw);
    const statements = splitStatements(prepared);

    let executed = 0;
    for (const statement of statements) {
      try {
        await sql.query(statement);
        executed += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  [skip] ${fileName}: ${msg.split("\n")[0]}`);
      }
    }
    totalExecuted += executed;
    console.log(`  ${fileName}: ${executed} statements`);
  }

  console.log(`\nNeon schema klaar. Totaal statements uitgevoerd: ${totalExecuted}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Schema toepassen mislukt:", message);
  process.exit(1);
});
