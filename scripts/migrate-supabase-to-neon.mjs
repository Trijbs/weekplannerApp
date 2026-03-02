import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@netlify/neon';

const DATABASE_ENV_NAMES = ['DATABASE_URL', 'NETLIFY_DATABASE_URL'];

const TABLES = [
  {
    name: 'app_settings',
    orderBy: 'created_at',
    columns: ['id', 'pin_hash', 'timezone', 'week_start_day', 'created_at', 'updated_at'],
  },
  {
    name: 'sessions',
    orderBy: 'created_at',
    columns: ['id', 'token_hash', 'expires_at', 'created_at', 'revoked_at'],
  },
  {
    name: 'drive_connections',
    orderBy: 'connected_at',
    columns: ['id', 'provider', 'oauth_access_token_enc', 'oauth_refresh_token_enc', 'expires_at', 'folder_id', 'connected_at', 'updated_at'],
  },
  {
    name: 'weeks',
    orderBy: 'created_at',
    columns: ['id', 'week_key', 'week_label', 'start_date', 'end_date', 'source_file_name', 'source_file_id', 'source_modified_at', 'created_at', 'updated_at'],
  },
  {
    name: 'import_jobs',
    orderBy: 'started_at',
    columns: ['id', 'provider', 'file_id', 'file_name', 'action', 'status', 'details_json', 'started_at', 'finished_at'],
    jsonColumns: ['details_json'],
  },
  {
    name: 'day_tasks',
    orderBy: 'created_at',
    columns: ['id', 'week_id', 'weekday', 'title', 'info', 'deadline_at', 'priority', 'status', 'position', 'source', 'created_at', 'updated_at'],
  },
  {
    name: 'hour_blocks',
    orderBy: 'created_at',
    columns: ['id', 'week_id', 'day_date', 'weekday', 'time_start', 'time_end', 'task_text', 'project_text', 'deadline_at', 'status', 'position', 'source', 'created_at', 'updated_at'],
  },
  {
    name: 'hour_entries',
    orderBy: 'created_at',
    columns: ['id', 'week_id', 'day_date', 'weekday', 'hours_decimal', 'project_name', 'note_text', 'source', 'created_at', 'updated_at'],
  },
  {
    name: 'task_history',
    orderBy: 'created_at',
    columns: ['id', 'week_id', 'entity_type', 'entity_id', 'event_type', 'actor', 'note_text', 'changed_fields', 'created_at'],
    jsonColumns: ['changed_fields'],
  },
];

const TRUNCATE_ORDER = [
  'task_history',
  'hour_entries',
  'hour_blocks',
  'day_tasks',
  'import_jobs',
  'drive_connections',
  'sessions',
  'weeks',
  'app_settings',
];

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

async function readEnvLocalValue(name) {
  try {
    const text = await fs.readFile(path.resolve(process.cwd(), '.env.local'), 'utf8');
    const line = text.split('\n').find((entry) => entry.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : null;
  } catch {
    return null;
  }
}

async function ensureEnv(name) {
  if (process.env[name]) return process.env[name];
  const localValue = await readEnvLocalValue(name);
  if (localValue) {
    process.env[name] = localValue;
    return localValue;
  }
  return null;
}

async function ensureDatabaseEnv() {
  for (const name of DATABASE_ENV_NAMES) {
    const value = await ensureEnv(name);
    if (value) {
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = value;
      }
      return value;
    }
  }

  return null;
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function fetchAllFromSupabase(client, table) {
  const rows = [];
  const pageSize = 500;
  let from = 0;

  while (true) {
    let query = client.from(table.name).select('*').range(from, from + pageSize - 1);
    if (table.orderBy) {
      query = query.order(table.orderBy, { ascending: true });
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase fetch failed for ${table.name}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);
    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function fetchAllFromNeon(sql, table) {
  const rows = await sql.query(`select * from ${table.name} order by ${table.orderBy ?? table.columns[0]} asc`);
  return rows;
}

function buildInsertQuery(table, rows) {
  const jsonColumns = new Set(table.jsonColumns ?? []);
  const params = [];
  const valuesSql = rows.map((row, rowIndex) => {
    const placeholders = table.columns.map((column, columnIndex) => {
      const paramIndex = rowIndex * table.columns.length + columnIndex + 1;
      const rawValue = row[column];
      params.push(jsonColumns.has(column) ? JSON.stringify(rawValue ?? {}) : rawValue ?? null);
      return jsonColumns.has(column) ? `$${paramIndex}::jsonb` : `$${paramIndex}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  return {
    text: `insert into ${table.name} (${table.columns.join(', ')}) values ${valuesSql.join(', ')}`,
    params,
  };
}

async function writeBackupFile(label, payload) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(process.cwd(), 'backups');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${timestamp}-${label}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

async function main() {
  await ensureDatabaseEnv();
  const supabaseUrl = required('SUPABASE_URL');
  const supabaseServiceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const neonUrl = required('DATABASE_URL');

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sql = neon(neonUrl);

  const sourceData = {};
  const targetBackup = {};

  for (const table of TABLES) {
    sourceData[table.name] = await fetchAllFromSupabase(supabase, table);
    targetBackup[table.name] = await fetchAllFromNeon(sql, table);
  }

  const sourceBackupFile = await writeBackupFile('supabase-source-snapshot', sourceData);
  const targetBackupFile = await writeBackupFile('neon-pre-migration-backup', targetBackup);
  console.log(`Supabase snapshot: ${sourceBackupFile}`);
  console.log(`Neon backup: ${targetBackupFile}`);

  await sql.transaction((txn) => {
    const statements = [];
    statements.push(txn.query(`truncate table ${TRUNCATE_ORDER.join(', ')} restart identity cascade`));

    for (const table of TABLES) {
      const rows = sourceData[table.name];
      for (const batch of chunk(rows, 200)) {
        if (batch.length === 0) continue;
        const { text, params } = buildInsertQuery(table, batch);
        statements.push(txn.query(text, params));
      }
    }

    return statements;
  }, { isolationLevel: 'RepeatableRead' });

  const verification = {};
  let mismatch = false;
  for (const table of TABLES) {
    const rows = await sql.query(`select count(*)::int as count from ${table.name}`);
    const count = Number(rows[0]?.count ?? 0);
    const expected = sourceData[table.name].length;
    verification[table.name] = { expected, actual: count };
    if (count !== expected) {
      mismatch = true;
    }
  }

  const verifyFile = await writeBackupFile('neon-post-migration-verify', verification);
  console.log(`Verification: ${verifyFile}`);
  console.log(JSON.stringify(verification, null, 2));

  if (mismatch) {
    throw new Error('Verification mismatch after migration. See backup/verification files.');
  }

  console.log('Supabase -> Neon migration completed successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
