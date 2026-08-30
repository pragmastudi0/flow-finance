-- Bank/card reconciliation.
--
-- Two tables: the statement that was imported, and the normalized movements
-- it produced. The movements table is deliberately source-agnostic — the PDF
-- parser fills it today, a CSV or a bank API would fill the same columns —
-- so the matching engine never learns where the data came from.
--
-- Both are owned by a user and protected by RLS, exactly like every other
-- table here. Nothing in this feature runs with elevated privileges from the
-- browser, and the edge function that consults the model never reads rows on
-- the user's behalf.

create type reconciliation_status as enum (
  'unmatched',   -- no candidate found
  'suggested',   -- the engine proposed a match, the user has not answered
  'confirmed',   -- the user accepted it; `matched_transaction_id` is set
  'rejected',    -- the user said no; never offered again for this pair
  'ignored'      -- not an expense to track (a card payment, a duplicate)
);

create type movement_kind as enum (
  'purchase', 'installment', 'payment', 'refund',
  'interest', 'tax', 'fee', 'cash_advance', 'adjustment', 'unknown'
);

create type movement_direction as enum ('debit', 'credit');

-- ─── statement imports ───────────────────────────────────────────────────────

create table flowfinance_statement_imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,

  file_name     text not null,
  -- SHA-256 of the uploaded bytes. Re-uploading the same file finds this row
  -- instead of importing a second copy.
  file_hash     text not null,
  source        text not null default 'pdf',

  card_last4    text,
  closing_date  date,
  due_date      date,

  -- What the parser saw: counts, the statement's own declared totals, and the
  -- lines it could not read. Kept so a bad import is diagnosable after the
  -- fact rather than only in the browser console.
  stats         jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index statement_imports_unique_file
  on flowfinance_statement_imports (user_id, file_hash);

create index statement_imports_user_created
  on flowfinance_statement_imports (user_id, created_at desc);

create trigger statement_imports_set_updated_at
  before update on flowfinance_statement_imports
  for each row execute function set_updated_at();

alter table flowfinance_statement_imports enable row level security;

create policy statement_imports_owner on flowfinance_statement_imports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── bank movements ──────────────────────────────────────────────────────────

create table flowfinance_bank_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  import_id      uuid references flowfinance_statement_imports on delete set null,

  occurred_on    date not null,
  -- As printed on the statement. The normalized form is derived in the app,
  -- not stored, so improving the normalizer does not need a backfill.
  description    text not null,
  -- Always positive; the sign lives in `direction`.
  amount         numeric(14,2) not null check (amount > 0),
  currency       currency_code not null default 'ARS',
  direction      movement_direction not null default 'debit',
  kind           movement_kind not null default 'purchase',

  source_reference     text,
  installment_current  integer check (installment_current > 0),
  installment_total    integer check (installment_total > 0),
  card_last4           text,

  -- Per-movement identity. August's statement and September's overlap on the
  -- instalments still running; the file hash cannot catch that, this does.
  fingerprint    text not null,

  status                 reconciliation_status not null default 'unmatched',
  matched_transaction_id uuid references flowfinance_transactions on delete set null,
  -- 0-100 with its three components, and why, when the model was consulted.
  match_score    numeric(5,2),
  match_detail   jsonb,
  matched_at     timestamptz,

  raw_line       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A confirmed match must actually name a transaction.
  constraint confirmed_has_transaction check (
    status <> 'confirmed' or matched_transaction_id is not null
  )
);

create unique index bank_transactions_unique_fingerprint
  on flowfinance_bank_transactions (user_id, fingerprint);

-- One app transaction is never the counterpart of two movements. The partial
-- index is what makes that true at the database level rather than by
-- convention: rejected and unmatched rows are free to point nowhere.
create unique index bank_transactions_unique_match
  on flowfinance_bank_transactions (user_id, matched_transaction_id)
  where matched_transaction_id is not null;

create index bank_transactions_user_date
  on flowfinance_bank_transactions (user_id, occurred_on desc);

create index bank_transactions_user_status
  on flowfinance_bank_transactions (user_id, status);

create index bank_transactions_import
  on flowfinance_bank_transactions (import_id);

create trigger bank_transactions_set_updated_at
  before update on flowfinance_bank_transactions
  for each row execute function set_updated_at();

alter table flowfinance_bank_transactions enable row level security;

create policy bank_transactions_owner on flowfinance_bank_transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
