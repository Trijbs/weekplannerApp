-- Add assignees array to hour_blocks for team assignment tracking
alter table hour_blocks
  add column if not exists assignees text[] not null default '{}';
