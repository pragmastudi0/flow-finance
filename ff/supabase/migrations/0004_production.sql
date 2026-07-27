-- Production hardening: indexes, auth config, missing RLS, performance

-- ─── Performance indexes ─────────────────────────────────────────────────────

create index if not exists transactions_monthly
  on flowfinance_transactions (user_id, (occurred_on::date))
  where occurred_on >= (current_date - interval '90 days');

create index if not exists receipts_analyzed_at
  on flowfinance_receipts (user_id, analyzed_at desc)
  where status = 'done';

create index if not exists ai_usage_cleanup
  on flowfinance_ai_usage (day)
  where day < current_date - interval '30 days';

-- ─── Auth trigger: create default exchange_rate_config on signup ────────────

create or replace function create_default_exchange_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into flowfinance_exchange_rate_configs (user_id, source_url, refresh_minutes)
  values (new.id, 'https://api.bluelytics.com.ar/v2/latest', 60)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function create_default_exchange_config();

-- ─── Storage bucket: ensure receipts bucket exists with correct settings ────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

-- ─── RLS: ensure storage.objects policy for receipts (idempotent) ───────────

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects'
    and schemaname = 'storage'
    and policyname = 'receipts_storage_owner'
  ) then
    create policy receipts_storage_owner on storage.objects
      for all to authenticated
      using (
        bucket_id = 'receipts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'receipts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end;
$$;

-- ─── Edge function permission: allow anon to invoke analyze-receipt ─────────

-- The edge function uses the anon key for user auth internally,
-- so no grant is needed here. The function validates the JWT itself.

-- ─── Cleanup old AI usage records (run periodically) ────────────────────────

-- Run via pg_cron or a scheduled edge function:
-- delete from flowfinance_ai_usage where day < current_date - interval '30 days';
