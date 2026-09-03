-- Tijdregistratie: timer-velden op hour_entries + projectbudgetten.
-- Uitsluitend additief: bestaande hour_entries-data blijft volledig intact.

alter table hour_entries add column if not exists started_at timestamptz;
alter table hour_entries add column if not exists stopped_at timestamptz;
alter table hour_entries add column if not exists hour_block_id uuid references hour_blocks(id) on delete set null;
alter table hour_entries add column if not exists day_task_id uuid references day_tasks(id) on delete set null;
alter table hour_entries add column if not exists status text not null default 'registered';

-- Een lopende timer heeft nog 0 uur; versoepel de ondergrens (bovengrens blijft 24).
alter table hour_entries drop constraint if exists hour_entries_hours_decimal_check;
alter table hour_entries add constraint hour_entries_hours_decimal_check
  check (hours_decimal >= 0 and hours_decimal <= 24);

alter table hour_entries drop constraint if exists hour_entries_status_check;
alter table hour_entries add constraint hour_entries_status_check
  check (status in ('running', 'registered'));

create index if not exists idx_hour_entries_running on hour_entries (status) where status = 'running';
create index if not exists idx_hour_entries_block on hour_entries (hour_block_id) where hour_block_id is not null;
create index if not exists idx_hour_entries_task on hour_entries (day_task_id) where day_task_id is not null;
create index if not exists idx_hour_entries_project on hour_entries (project_name);

create table if not exists project_budgets (
  id uuid primary key default gen_random_uuid(),
  project_name text not null unique,
  budget_hours numeric(6,2) not null check (budget_hours > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_budgets enable row level security;
