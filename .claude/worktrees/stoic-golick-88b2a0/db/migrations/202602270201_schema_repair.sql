-- Repair migration: ensures required Weekplanner tables exist even if
-- migration history was marked applied while schema objects are missing.

create extension if not exists pgcrypto;

create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null,
  timezone text not null default 'Europe/Amsterdam',
  week_start_day text not null default 'maandag',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists drive_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  oauth_access_token_enc text not null,
  oauth_refresh_token_enc text not null,
  expires_at timestamptz not null,
  folder_id text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weeks (
  id uuid primary key default gen_random_uuid(),
  week_key text not null unique,
  week_label text not null,
  start_date date not null,
  end_date date not null,
  source_file_name text,
  source_file_id text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists day_tasks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  weekday text not null,
  title text not null,
  info text not null default '',
  deadline_at timestamptz,
  priority text not null,
  status text not null,
  position integer not null default 0,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hour_blocks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  day_date date,
  weekday text not null,
  time_start text not null,
  time_end text not null,
  task_text text not null default '',
  project_text text not null default '',
  deadline_at timestamptz,
  status text not null,
  position integer not null default 0,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hour_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  day_date date not null,
  weekday text not null,
  hours_decimal numeric(5,2) not null check (hours_decimal > 0 and hours_decimal <= 24),
  project_name text not null default '',
  note_text text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_history (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor text not null,
  note_text text not null,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  file_id text,
  file_name text not null,
  action text not null,
  status text not null,
  details_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_day_tasks_week on day_tasks (week_id, weekday, position);
create index if not exists idx_hour_blocks_week on hour_blocks (week_id, weekday, position);
create index if not exists idx_hour_entries_week on hour_entries (week_id, day_date);
create index if not exists idx_task_history_week on task_history (week_id, created_at desc);
create index if not exists idx_import_jobs_started on import_jobs (started_at desc);

alter table app_settings enable row level security;
alter table sessions enable row level security;
alter table drive_connections enable row level security;
alter table weeks enable row level security;
alter table day_tasks enable row level security;
alter table hour_blocks enable row level security;
alter table hour_entries enable row level security;
alter table task_history enable row level security;
alter table import_jobs enable row level security;
