/**
 * Persistence for the reconciliation module.
 *
 * The only layer that talks to Supabase. Everything above it works with the
 * domain types, everything below is RLS — every query here is a plain
 * authenticated read or write against the caller's own rows, so a user can
 * only ever see, match or modify their own statements. There is no service
 * role anywhere in this file and no policy is bypassed.
 */
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import {
  demoBankTransactions,
  demoStatementImports,
  demoTransactions,
  getDemoUser,
} from '@/lib/demo.ts';
import { toBankMovement, toBankMovementRow, toTransaction, toTransactionRow, type TransactionInput } from '@/lib/mappers.ts';
import { checkAgainstSubtotal, type ParsedStatement } from '@/domain/reconciliation/statement.ts';
import type {
  BankMovement,
  PaymentMethod,
  ScoreBreakdown,
} from '@/domain/reconciliation/types.ts';
import type { Transaction } from '@/types/models.ts';

export class ReconciliationError extends Error {
  constructor(
    readonly code: 'auth' | 'offline' | 'duplicate' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'ReconciliationError';
  }
}

async function currentUserId(): Promise<string> {
  if (isDemoMode()) {
    const user = getDemoUser();
    if (!user) throw new ReconciliationError('auth', 'No hay sesión activa');
    return user.id;
  }
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new ReconciliationError('auth', 'No hay sesión activa');
  return data.user.id;
}

export interface StatementImportRecord {
  id: string;
  fileName: string;
  fileHash: string;
  cardLast4: string | null;
  closingDate: string | null;
  dueDate: string | null;
  /** What the parser saw, including the subtotal check and unread lines. */
  stats: Record<string, unknown>;
  createdAt: string;
}

/** How far along one import is, for the history list. */
export interface ImportProgress {
  total: number;
  confirmed: number;
  pending: number;
}

const IMPORT_COLUMNS =
  'id, file_name, file_hash, card_last4, closing_date, due_date, stats, created_at';

function toImportRecord(row: Record<string, any>): StatementImportRecord {
  return {
    id: row.id,
    fileName: row.file_name ?? row.fileName ?? '',
    fileHash: row.file_hash ?? row.fileHash ?? '',
    cardLast4: row.card_last4 ?? row.cardLast4 ?? null,
    closingDate: row.closing_date ?? row.closingDate ?? null,
    dueDate: row.due_date ?? row.dueDate ?? null,
    stats: row.stats ?? {},
    createdAt: row.created_at ?? row.createdAt ?? '',
  };
}

export interface ImportOutcome {
  importId: string;
  /** True when this exact file had already been imported. */
  alreadyImported: boolean;
  /** Movements new to this account. */
  inserted: number;
  /** Movements the fingerprint index recognised from an earlier statement. */
  duplicates: number;
  movements: BankMovement[];
}

/** Has this exact file been imported before? */
export async function findImportByHash(fileHash: string): Promise<StatementImportRecord | null> {
  if (isDemoMode()) {
    const row = demoStatementImports.getAll().find((r) => r.fileHash === fileHash);
    return row ? toImportRecord(row) : null;
  }
  const { data, error } = await supabase
    .from('flowfinance_statement_imports')
    .select(IMPORT_COLUMNS)
    .eq('file_hash', fileHash)
    .maybeSingle();
  if (error) throw new ReconciliationError('unknown', error.message);
  return data ? toImportRecord(data) : null;
}

/** One import by id, for reopening it without the PDF. */
export async function findImport(importId: string): Promise<StatementImportRecord | null> {
  if (isDemoMode()) {
    const row = demoStatementImports.getById(importId);
    return row ? toImportRecord(row) : null;
  }
  const { data, error } = await supabase
    .from('flowfinance_statement_imports')
    .select(IMPORT_COLUMNS)
    .eq('id', importId)
    .maybeSingle();
  if (error) throw new ReconciliationError('unknown', error.message);
  return data ? toImportRecord(data) : null;
}

/**
 * Persist a parsed statement.
 *
 * Idempotent on two levels. The file hash catches re-uploading the same PDF;
 * the per-movement fingerprint catches the overlap between consecutive
 * statements, which the file hash cannot see. Rows that collide on the
 * fingerprint are skipped rather than rejected, so a partial re-import adds
 * exactly the movements that are new.
 */
export async function saveStatementImport(
  fileName: string,
  fileHash: string,
  statement: ParsedStatement,
): Promise<ImportOutcome> {
  const userId = await currentUserId();
  const existing = await findImportByHash(fileHash);

  if (isDemoMode()) {
    const importId =
      existing?.id ??
      demoStatementImports.insert({
        id: crypto.randomUUID(),
        fileName,
        fileHash,
        cardLast4: statement.cardLast4,
        closingDate: statement.closingDate,
        createdAt: new Date().toISOString(),
      }).id;

    const known = new Set(demoBankTransactions.getAll().map((m) => m.fingerprint));
    let inserted = 0;
    for (const movement of statement.movements) {
      if (known.has(movement.fingerprint)) continue;
      known.add(movement.fingerprint);
      demoBankTransactions.insert({ ...movement, id: crypto.randomUUID(), importId });
      inserted++;
    }
    return {
      importId,
      alreadyImported: Boolean(existing),
      inserted,
      duplicates: statement.movements.length - inserted,
      movements: await loadMovements(importId),
    };
  }

  let importId = existing?.id;
  if (!importId) {
    const { data, error } = await supabase
      .from('flowfinance_statement_imports')
      .insert({
        user_id: userId,
        file_name: fileName.slice(0, 200),
        file_hash: fileHash,
        source: 'pdf',
        card_last4: statement.cardLast4,
        closing_date: statement.closingDate,
        due_date: statement.dueDate,
        // The whole meta, not just the counters: this is what lets the
        // screen reopen a past import without the PDF being re-uploaded.
        stats: {
          ...statement.stats,
          needsReview: statement.needsReview,
          declaredSubtotal: statement.declaredSubtotal,
          declaredTotal: statement.declaredTotal,
          subtotalCheck: checkAgainstSubtotal(statement),
        },
      })
      .select('id')
      .single();
    if (error || !data) throw new ReconciliationError('unknown', error?.message ?? 'import failed');
    importId = data.id;
  }

  // `ignoreDuplicates` turns the fingerprint index into the deduplicator: the
  // second import of an overlapping statement inserts only what is new
  // instead of failing the whole batch on the first repeat.
  const rows = statement.movements.map((m) => ({
    ...toBankMovementRow(m),
    user_id: userId,
    import_id: importId,
  }));

  let inserted = 0;
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('flowfinance_bank_transactions')
      .upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true })
      .select('id');
    if (error) throw new ReconciliationError('unknown', error.message);
    inserted = data?.length ?? 0;
  }

  return {
    importId: importId!,
    alreadyImported: Boolean(existing),
    inserted,
    duplicates: statement.movements.length - inserted,
    movements: await loadMovements(importId!),
  };
}

/** Every movement of one import, newest first. */
export async function loadMovements(importId: string): Promise<BankMovement[]> {
  if (isDemoMode()) {
    return demoBankTransactions
      .getAll()
      .filter((m) => m.importId === importId)
      .map(toBankMovement)
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  }
  const { data, error } = await supabase
    .from('flowfinance_bank_transactions')
    .select('*')
    .eq('import_id', importId)
    .order('occurred_on', { ascending: false });
  if (error) throw new ReconciliationError('unknown', error.message);
  return (data ?? []).map(toBankMovement);
}

/** The most recent imports, for the screen's history. */
export async function listImports(limit = 10): Promise<StatementImportRecord[]> {
  if (isDemoMode()) {
    return demoStatementImports.getAll().slice(0, limit).map(toImportRecord);
  }
  const { data, error } = await supabase
    .from('flowfinance_statement_imports')
    .select(IMPORT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new ReconciliationError('unknown', error.message);
  return (data ?? []).map(toImportRecord);
}

/**
 * How far along each import is — "12 conciliados · 5 pendientes" on the
 * history list.
 *
 * One query for the whole list rather than one per row: the counting is done
 * here because PostgREST has no GROUP BY, and shipping a few hundred short
 * rows beats N round trips.
 */
export async function loadImportProgress(
  importIds: string[],
): Promise<Map<string, ImportProgress>> {
  const progress = new Map<string, ImportProgress>();
  if (importIds.length === 0) return progress;

  const rows = isDemoMode()
    ? demoBankTransactions
        .getAll()
        .filter((m) => importIds.includes(m.importId))
        .map((m) => ({ import_id: m.importId, status: m.status ?? 'unmatched' }))
    : await (async () => {
        const { data, error } = await supabase
          .from('flowfinance_bank_transactions')
          .select('import_id, status')
          .in('import_id', importIds);
        if (error) throw new ReconciliationError('unknown', error.message);
        return data ?? [];
      })();

  for (const row of rows as Array<{ import_id: string; status: string }>) {
    const current = progress.get(row.import_id) ?? { total: 0, confirmed: 0, pending: 0 };
    current.total++;
    if (row.status === 'confirmed') current.confirmed++;
    else if (row.status === 'unmatched' || row.status === 'suggested') current.pending++;
    progress.set(row.import_id, current);
  }

  return progress;
}

/**
 * The expenses a statement could plausibly correspond to: the same window as
 * the movements, widened by the date tolerance on both ends.
 */
export async function loadExpensesInRange(from: string, to: string): Promise<Transaction[]> {
  if (isDemoMode()) {
    return demoTransactions
      .getAll()
      .map(toTransaction)
      .filter((t) => t.type === 'expense' && t.occurredOn >= from && t.occurredOn <= to);
  }
  const { data, error } = await supabase
    .from('flowfinance_transactions')
    .select('*')
    .eq('type', 'expense')
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (error) throw new ReconciliationError('unknown', error.message);
  return (data ?? []).map(toTransaction);
}

export interface ConfirmedMatch {
  movement: BankMovement;
  /** The expense it was reconciled against. Null if it was since deleted. */
  transaction: Transaction | null;
  matchedAt: string | null;
  score: number | null;
}

/**
 * What the user already accepted on this import.
 *
 * The expense rides along on the same request: the
 * `matched_transaction_id → flowfinance_transactions` foreign key lets
 * PostgREST embed it, so showing both sides of a settled pair costs one
 * round trip rather than one per row.
 */
export async function loadConfirmedMatches(importId: string): Promise<ConfirmedMatch[]> {
  if (isDemoMode()) {
    return demoBankTransactions
      .getAll()
      .filter((m) => m.importId === importId && m.status === 'confirmed')
      .map((m) => {
        const tx = m.matchedTransactionId
          ? demoTransactions.getById(m.matchedTransactionId)
          : null;
        return {
          movement: toBankMovement(m),
          transaction: tx ? toTransaction(tx) : null,
          matchedAt: m.matchedAt ?? null,
          score: m.matchScore ?? null,
        };
      });
  }

  const { data, error } = await supabase
    .from('flowfinance_bank_transactions')
    .select('*, matched:matched_transaction_id(*)')
    .eq('import_id', importId)
    .eq('status', 'confirmed')
    .order('matched_at', { ascending: false });
  if (error) throw new ReconciliationError('unknown', error.message);

  return (data ?? []).map((row: Record<string, any>) => ({
    movement: toBankMovement(row),
    transaction: row.matched ? toTransaction(row.matched) : null,
    matchedAt: row.matched_at ?? null,
    score: row.match_score === null || row.match_score === undefined ? null : Number(row.match_score),
  }));
}

/**
 * Undo a confirmation.
 *
 * The movement goes back to looking for a match — `unmatched` rather than
 * `rejected`, because the user is taking the link back, not saying the pair
 * was wrong. The expense itself is untouched: it was never modified by
 * confirming, so there is nothing to restore.
 */
export async function undoMatch(movementId: string): Promise<void> {
  if (isDemoMode()) {
    demoBankTransactions.update(movementId, {
      status: 'unmatched',
      matchedTransactionId: null,
      matchScore: null,
      matchDetail: null,
      matchedAt: null,
    });
    return;
  }
  const { error } = await supabase
    .from('flowfinance_bank_transactions')
    .update({
      status: 'unmatched',
      matched_transaction_id: null,
      match_score: null,
      match_detail: null,
      matched_at: null,
    })
    .eq('id', movementId);
  if (error) throw new ReconciliationError('unknown', error.message);
}

/**
 * App transactions already claimed by a confirmed movement — from *any*
 * import, not just this one.
 *
 * Without this an expense reconciled against August's statement would be
 * offered again when September's overlapping instalments arrive, and the
 * partial unique index would reject the confirmation only after the user had
 * pressed the button.
 */
export async function loadReconciledTransactionIds(): Promise<Set<string>> {
  if (isDemoMode()) {
    return new Set(
      demoBankTransactions
        .getAll()
        .filter((m) => m.status === 'confirmed' && m.matchedTransactionId)
        .map((m) => m.matchedTransactionId as string),
    );
  }
  const { data, error } = await supabase
    .from('flowfinance_bank_transactions')
    .select('matched_transaction_id')
    .eq('status', 'confirmed')
    .not('matched_transaction_id', 'is', null);
  if (error) throw new ReconciliationError('unknown', error.message);
  return new Set((data ?? []).map((row) => row.matched_transaction_id as string));
}

/**
 * Accept a suggestion.
 *
 * Writes the link and nothing else: the expense's own amount, date and
 * category are left exactly as the user entered them. Changing a figure the
 * user typed is a separate, explicit action — see `updateExpenseAmount`.
 */
export async function confirmMatch(
  movementId: string,
  transactionId: string,
  score: ScoreBreakdown,
  reason?: string,
  options: { stampAsCard?: boolean } = {},
): Promise<void> {
  const detail = { ...score, reason: reason ?? null };

  // Confirming that an expense is this card movement *is* the statement that
  // it was paid by card, so an expense with no method recorded gets one. Only
  // when it is empty — a method the user actually chose is never overwritten,
  // and no amount, date or category is touched either way.
  if (options.stampAsCard) {
    await setPaymentMethodIfEmpty(transactionId, 'credit');
  }
  if (isDemoMode()) {
    demoBankTransactions.update(movementId, {
      status: 'confirmed',
      matchedTransactionId: transactionId,
      matchScore: score.total,
      matchDetail: detail,
      matchedAt: new Date().toISOString(),
    });
    return;
  }
  const { error } = await supabase
    .from('flowfinance_bank_transactions')
    .update({
      status: 'confirmed',
      matched_transaction_id: transactionId,
      match_score: score.total,
      match_detail: detail,
      matched_at: new Date().toISOString(),
    })
    .eq('id', movementId);
  // The partial unique index is what stops one expense being claimed twice.
  if (error) {
    throw new ReconciliationError(
      error.code === '23505' ? 'duplicate' : 'unknown',
      error.message,
    );
  }
}

/** Turn a suggestion down. The movement goes back to looking for a match. */
export async function rejectMatch(movementId: string): Promise<void> {
  if (isDemoMode()) {
    demoBankTransactions.update(movementId, {
      status: 'rejected',
      matchedTransactionId: null,
      matchedAt: new Date().toISOString(),
    });
    return;
  }
  const { error } = await supabase
    .from('flowfinance_bank_transactions')
    .update({
      status: 'rejected',
      matched_transaction_id: null,
      matched_at: new Date().toISOString(),
    })
    .eq('id', movementId);
  if (error) throw new ReconciliationError('unknown', error.message);
}

/** Not an expense to track (a card payment, a duplicate line). */
export async function ignoreMovement(movementId: string): Promise<void> {
  if (isDemoMode()) {
    demoBankTransactions.update(movementId, { status: 'ignored' });
    return;
  }
  const { error } = await supabase
    .from('flowfinance_bank_transactions')
    .update({ status: 'ignored' })
    .eq('id', movementId);
  if (error) throw new ReconciliationError('unknown', error.message);
}

/**
 * Register a movement the app did not have, and link it in one go.
 *
 * The expense itself is written through the same row mapper every other
 * creation path uses, so a reconciled expense is indistinguishable from a
 * typed one — no second shape, no second set of defaults.
 */
export async function createExpenseFromMovement(
  movement: BankMovement,
  input: TransactionInput,
): Promise<string> {
  const userId = await currentUserId();
  // It came off a credit card statement, so the method is not a guess.
  const expense: TransactionInput = { ...input, paymentMethod: input.paymentMethod ?? 'credit' };

  const transactionId = isDemoMode()
    ? demoTransactions.insert({
        ...expense,
        id: crypto.randomUUID(),
        user_id: userId,
        createdAt: new Date().toISOString(),
      }).id
    : await (async () => {
        const { data, error } = await supabase
          .from('flowfinance_transactions')
          .insert({ ...toTransactionRow(expense), user_id: userId })
          .select('id')
          .single();
        if (error || !data) throw new ReconciliationError('unknown', error?.message ?? 'insert failed');
        return data.id as string;
      })();

  await confirmMatch(
    movement.id,
    transactionId,
    { description: 100, date: 100, amount: 100, total: 100 },
    'Gasto creado desde el resumen',
  );

  return transactionId;
}

/**
 * Record how an expense was paid, but only if nothing was recorded yet.
 *
 * Used when a movement is reconciled: the fact comes from the statement, not
 * from a guess. A method the user picked themselves always wins.
 */
export async function setPaymentMethodIfEmpty(
  transactionId: string,
  method: PaymentMethod,
): Promise<void> {
  if (isDemoMode()) {
    const tx = demoTransactions.getById(transactionId);
    if (tx && !tx.paymentMethod) demoTransactions.update(transactionId, { paymentMethod: method });
    return;
  }
  const { error } = await supabase
    .from('flowfinance_transactions')
    .update({ payment_method: method })
    .eq('id', transactionId)
    .is('payment_method', null);
  if (error) throw new ReconciliationError('unknown', error.message);
}

/**
 * Bring an expense's amount in line with what the card actually charged.
 *
 * Only ever called from the difference control on the review screen, and
 * only after the user picks it. Nothing in this module rewrites a financial
 * figure on its own.
 */
export async function updateExpenseAmount(transactionId: string, amount: number): Promise<void> {
  if (isDemoMode()) {
    demoTransactions.update(transactionId, { amount });
    return;
  }
  const { error } = await supabase
    .from('flowfinance_transactions')
    .update({ amount })
    .eq('id', transactionId);
  if (error) throw new ReconciliationError('unknown', error.message);
}
