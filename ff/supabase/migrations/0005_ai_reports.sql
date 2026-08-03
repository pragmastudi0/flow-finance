-- AI report cache.
--
-- Generating a report costs a model call and a few seconds, so opening the
-- screen must not trigger one. Each (user, month) keeps its latest report and
-- the screen reads that until the user explicitly regenerates.
--
-- Named with the `flowfinance_` prefix like every other table here, so the
-- schema stays greppable in a shared database.

create table if not exists flowfinance_ai_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  -- First day of the analysed month; `date` rather than text so it sorts and
  -- compares correctly.
  month          date not null,
  response_json  jsonb not null,
  -- Which model produced it, so a stale report is identifiable after a
  -- provider switch.
  provider       text,
  model          text,
  created_at     timestamptz not null default now(),
  -- One row per user per month: regenerating replaces rather than accumulates.
  unique (user_id, month)
);

create index if not exists ai_reports_user_month
  on flowfinance_ai_reports (user_id, month desc);

alter table flowfinance_ai_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'flowfinance_ai_reports' and policyname = 'flowfinance_ai_reports_owner'
  ) then
    create policy flowfinance_ai_reports_owner on flowfinance_ai_reports
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;
