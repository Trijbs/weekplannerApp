create table if not exists thought_threads (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references weeks(id) on delete set null,
  day_date date,
  title text not null default 'Nieuwe gedachten',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists thought_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references thought_threads(id) on delete cascade,
  role text not null default 'user',
  body_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists thought_summaries (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references thought_threads(id) on delete cascade,
  content_json jsonb not null default '{}'::jsonb,
  message_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_thought_threads_updated on thought_threads (updated_at desc);
create index if not exists idx_thought_messages_thread on thought_messages (thread_id, created_at);
create index if not exists idx_thought_summaries_thread on thought_summaries (thread_id, created_at desc);

alter table thought_threads enable row level security;
alter table thought_messages enable row level security;
alter table thought_summaries enable row level security;
