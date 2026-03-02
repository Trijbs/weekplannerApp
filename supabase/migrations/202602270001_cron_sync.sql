-- Hourly Drive sync trigger via pg_cron using secrets from Supabase Vault.
--
-- Configure once (SQL Editor), do not commit raw secrets:
-- select vault.create_secret('https://your-vercel-domain/api/cron/sync-drive', 'weekplanner_cron_url', 'Weekplanner cron endpoint');
-- select vault.create_secret('your-cron-secret', 'weekplanner_cron_secret', 'Weekplanner cron bearer token');

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'weekplanner-hourly-sync'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select
  cron.schedule(
    'weekplanner-hourly-sync',
    '0 * * * *',
    $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'weekplanner_cron_url'
        order by created_at desc
        limit 1
      ),
      headers := jsonb_build_object(
        'authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'weekplanner_cron_secret'
          order by created_at desc
          limit 1
        )
      )
    );
    $$
  );
