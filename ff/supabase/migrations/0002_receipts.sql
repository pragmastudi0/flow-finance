-- Receipt photos and their AI analysis.
--
-- The image goes to a private Storage bucket, the extracted fields land here,
-- and the user confirms before a transaction is created. Nothing is saved
-- automatically: the model is a suggestion engine, not a source of truth.

create type receipt_status as enum ('pending', 'analyzing', 'done', 'failed');

create table flowfinance_receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,

  -- Object key inside the `receipts` bucket: `<user_id>/<uuid>.jpg`
  storage_path   text not null,
  status         receipt_status not null default 'pending',

  -- Filled in by the analyze-receipt function.
  merchant       text,
  total          numeric(14,2),
  currency       currency_code,
  receipt_date   date,
  items          jsonb not null default '[]'::jsonb,
  confidence     numeric(3,2) check (confidence between 0 and 1),

  -- Which model produced this, so a bad batch can be found later.
  provider       text,
  model          text,
  error          text,

  -- Set once the user confirms. Null means "extracted but not accepted yet".
  transaction_id uuid references flowfinance_transactions on delete set null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  analyzed_at    timestamptz
);

create index receipts_user_created on flowfinance_receipts (user_id, created_at desc);
create index receipts_pending on flowfinance_receipts (user_id) where status = 'pending';

create trigger receipts_set_updated_at
  before update on flowfinance_receipts
  for each row execute function set_updated_at();

alter table flowfinance_receipts enable row level security;

create policy receipts_owner on flowfinance_receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── storage ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Each user can only touch objects under their own uuid prefix.
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

-- ─── quota ───────────────────────────────────────────────────────────────────
-- Free AI tiers are rate limited and shared across the whole project, so one
-- user uploading a hundred photos would lock everyone else out for the day.

create table flowfinance_ai_usage (
  user_id  uuid not null references auth.users on delete cascade,
  day      date not null default current_date,
  calls    integer not null default 0,
  primary key (user_id, day)
);

alter table flowfinance_ai_usage enable row level security;

create policy ai_usage_owner on flowfinance_ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

/**
 * Atomically claim one analysis for today. Returns false when the user is over
 * their daily allowance. Called by the edge function with the service role.
 */
create or replace function claim_ai_call(p_user_id uuid, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
begin
  insert into flowfinance_ai_usage (user_id, day, calls)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update
    set calls = flowfinance_ai_usage.calls + 1
  returning calls into v_calls;

  return v_calls <= p_daily_limit;
end;
$$;

revoke execute on function claim_ai_call(uuid, integer) from public, anon, authenticated;
