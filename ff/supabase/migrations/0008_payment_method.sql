-- How each expense was paid.
--
-- Reconciliation compares a *credit card* statement against every expense in
-- the window, because the app has no way to know which of them could have
-- been on that card. Cash and transfers are therefore offered as candidates
-- and are the largest single source of wrong suggestions.
--
-- Nullable on purpose, and with no backfill: `null` means nobody said, which
-- is every row that predates this column. The matching engine treats that as
-- "could have been on the card" — guessing 'credit' for existing rows would
-- write a fact the user never stated into their history, and excluding them
-- would leave nothing to reconcile.

create type payment_method as enum ('cash', 'transfer', 'debit', 'credit', 'other');

alter table flowfinance_transactions
  add column payment_method payment_method;

comment on column flowfinance_transactions.payment_method is
  'How it was paid. Null means unrecorded, not unknown-and-excluded: the reconciliation engine still considers those rows.';
