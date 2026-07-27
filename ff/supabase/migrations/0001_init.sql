-- Flow Finance — initial schema
--
-- Every table is owned by a user and protected by RLS. The original app filtered
-- by `created_by` from the browser, which is not an access control boundary
-- (H-1). Here the database enforces it.

create extension if not exists "pgcrypto";

-- ─── enums ───────────────────────────────────────────────────────────────────

create type tx_type          as enum ('expense', 'income');
create type currency_code    as enum ('ARS', 'USD');
create type recurrence_type  as enum ('installments', 'subscription');
create type fixed_status     as enum ('active', 'cancelled', 'completed');
create type goal_status      as enum ('active', 'achieved', 'archived');
create type fetch_status     as enum ('pending', 'ok', 'error');

-- ─── shared trigger ──────────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── flowfinance_categories ──────────────────────────────────────────────────────────────
-- Only user-created ones. The built-in flowfinance_categories live in the app as constants,
-- same as the original.

create table flowfinance_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40),
  icon        text not null default '📝',
  color       text not null default 'slate',
  type        tx_type not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index categories_unique_name
  on flowfinance_categories (user_id, type, lower(name));

-- ─── flowfinance_transactions ────────────────────────────────────────────────────────────

create table flowfinance_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  type         tx_type not null,
  -- Amount as entered, in `currency`. Base value = amount * fx_rate (H-3).
  amount       numeric(14,2) not null check (amount > 0),
  currency     currency_code not null default 'ARS',
  fx_rate      numeric(14,4) not null default 1 check (fx_rate > 0),
  category     text not null,
  description  text not null default '',
  occurred_on  date not null,
  raw_input    text,
  calculation  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index transactions_user_date on flowfinance_transactions (user_id, occurred_on desc);
create index transactions_user_created on flowfinance_transactions (user_id, created_at desc);
create index transactions_user_category on flowfinance_transactions (user_id, category);

-- ─── category learnings ──────────────────────────────────────────────────────

create table flowfinance_category_learnings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  keyword     text not null,
  category    text not null,
  type        tx_type not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index category_learnings_unique
  on flowfinance_category_learnings (user_id, type, lower(keyword));

-- ─── fixed expenses ──────────────────────────────────────────────────────────

create table flowfinance_fixed_expenses (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users on delete cascade,
  description            text not null,
  amount                 numeric(14,2) not null check (amount > 0),
  currency               currency_code not null default 'ARS',
  category               text not null,
  recurrence             recurrence_type not null,
  start_date             date not null,
  installments           integer check (installments > 0),
  remaining_installments integer check (remaining_installments >= 0),
  status                 fixed_status not null default 'active',
  cancelled_on           date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint installments_present check (
    (recurrence = 'installments' and installments is not null)
    or (recurrence = 'subscription' and installments is null)
  )
);

create index fixed_expenses_user_status on flowfinance_fixed_expenses (user_id, status);

-- ─── savings ─────────────────────────────────────────────────────────────────

create table flowfinance_savings_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  description  text not null,
  goal_amount  numeric(14,2) not null check (goal_amount > 0),
  target_date  date not null,
  status       goal_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Contributions are the source of truth for progress (H-2). The original kept a
-- `currentSavedAmount` column and never wrote this table, which left the
-- "on track / needs more savings" estimate permanently empty.
create table flowfinance_savings_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  goal_id      uuid not null references flowfinance_savings_goals on delete cascade,
  -- Negative rows are withdrawals; that is what the "Restar" button records.
  amount       numeric(14,2) not null check (amount <> 0),
  occurred_on  date not null default current_date,
  created_at   timestamptz not null default now()
);

create index savings_contributions_goal on flowfinance_savings_contributions (goal_id, created_at desc);

create view flowfinance_savings_goals_with_progress
with (security_invoker = true) as
select
  g.*,
  coalesce(sum(c.amount), 0)                                as current_saved_amount,
  greatest(g.goal_amount - coalesce(sum(c.amount), 0), 0)   as remaining_amount,
  least(coalesce(sum(c.amount), 0) / g.goal_amount * 100, 100) as progress_pct
from flowfinance_savings_goals g
left join flowfinance_savings_contributions c on c.goal_id = g.id
group by g.id;

-- ─── exchange rate ───────────────────────────────────────────────────────────

create table flowfinance_exchange_rate_configs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users on delete cascade,
  source_url       text not null default 'https://api.bluelytics.com.ar/v2/latest',
  refresh_minutes  integer not null default 60 check (refresh_minutes between 15 and 1440),
  last_value       numeric(14,4),
  last_updated_at  timestamptz,
  last_status      fetch_status not null default 'pending',
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table flowfinance_exchange_rate_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  captured_at    timestamptz not null default now(),
  status         fetch_status not null,
  rate_buy       numeric(14,4),
  rate_sell      numeric(14,4),
  error_message  text
);

create index exchange_rate_history_user on flowfinance_exchange_rate_history (user_id, captured_at desc);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'flowfinance_categories', 'flowfinance_transactions', 'flowfinance_category_learnings',
    'flowfinance_fixed_expenses', 'flowfinance_savings_goals', 'flowfinance_exchange_rate_configs'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ─── row level security ──────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'flowfinance_categories', 'flowfinance_transactions', 'flowfinance_category_learnings', 'flowfinance_fixed_expenses',
    'flowfinance_savings_goals', 'flowfinance_savings_contributions', 'flowfinance_exchange_rate_configs',
    'flowfinance_exchange_rate_history'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_owner on %I
       for all to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;
