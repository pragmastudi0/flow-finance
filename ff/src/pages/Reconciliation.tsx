import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { UploadZone } from '@/components/analysis/UploadZone';
import { MatchCard } from '@/components/reconciliation/MatchCard';
import { MovementRow } from '@/components/reconciliation/MovementRow';
import { CreateExpenseSheet } from '@/components/reconciliation/CreateExpenseSheet';
import { ImportHistory } from '@/components/reconciliation/ImportHistory';
import { ConfirmedRow } from '@/components/reconciliation/ConfirmedRow';
import { useLanguage } from '@/i18n/LanguageProvider';
import { ROUTES } from '@/lib/routes';
import { formatCurrency, formatDate } from '@/lib/format';
import { useReconciliation, type ImportErrorCode, type ImportStage } from '@/hooks/useReconciliation';
import type { BankMovement, MatchSuggestion } from '@/domain/reconciliation/types';

const STAGE_LABEL: Record<Exclude<ImportStage, 'idle' | 'done' | 'error'>, string> = {
  reading: 'reconciliationReading',
  parsing: 'reconciliationParsing',
  saving: 'reconciliationSaving',
  matching: 'reconciliationMatching',
  ai: 'reconciliationAi',
};

/**
 * The review tray.
 *
 * Three groups and a count line, in the order a person actually works
 * through them: what is settled, what needs a decision, and what is missing
 * on each side. Nothing on this screen writes until a button is pressed —
 * even a 100 % match is a recommendation with a Reconcile button under it.
 */
export default function Reconciliation() {
  const { t, language } = useLanguage();
  const {
    stage, error, view, importStatement, openImport, reset,
    accept, decline, ignore, createExpense, undo,
  } = useReconciliation();
  const [busy, setBusy] = useState(false);
  const [creatingFrom, setCreatingFrom] = useState<BankMovement | null>(null);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAccept = (suggestion: MatchSuggestion, options?: { adoptCardAmount?: boolean }) =>
    run(() => accept(suggestion, options), t('reconciled'));

  return (
    <PageShell>
      <PageHeader
        title={t('reconciliation')}
        subtitle={t('reconciliationSubtitle')}
        back={ROUTES.settings}
      />

      {stage === 'idle' && (
        <div className="space-y-7">
          <ImportHistory onOpen={openImport} />
          <UploadZone
            onFileSelected={importStatement}
            acceptedTypes={['application/pdf']}
            accept="application/pdf"
            icon={FileText}
            title={t('reconciliationUploadTitle')}
            hint={t('reconciliationFormats')}
          />
        </div>
      )}

      {stage !== 'idle' && stage !== 'done' && stage !== 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-muted/60 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-ink-tertiary" />
          <p className="text-[15px] text-ink-secondary">
            {t(STAGE_LABEL[stage as keyof typeof STAGE_LABEL] as never)}
          </p>
        </div>
      )}

      {stage === 'error' && <ImportError code={error} onRetry={reset} />}

      {stage === 'done' && view && (
        <div className="space-y-7">
          <Summary view={view} />

          {view.confirmed.length > 0 && (
            <Group title={t('confirmedGroup')} count={view.confirmed.length}>
              <div className="overflow-hidden rounded-2xl bg-surface-muted/60">
                {view.confirmed.map((match) => (
                  <ConfirmedRow
                    key={match.movement.id}
                    match={match}
                    busy={busy}
                    onUndo={() => run(() => undo(match), t('undone'))}
                  />
                ))}
              </div>
            </Group>
          )}

          {view.matches.length > 0 && (
            <Group title={t('matchesGroup')} count={view.matches.length}>
              <div className="space-y-3">
                {view.matches.map((suggestion) => (
                  <MatchCard
                    key={suggestion.movement.id}
                    suggestion={suggestion}
                    busy={busy}
                    onAccept={(options) => onAccept(suggestion, options)}
                    onReject={() => run(() => decline(suggestion), t('rejectAction'))}
                  />
                ))}
              </div>
            </Group>
          )}

          {view.review.length > 0 && (
            <Group title={t('reviewGroup')} count={view.review.length}>
              <div className="space-y-3">
                {view.review.map((suggestion) => (
                  <MatchCard
                    key={suggestion.movement.id}
                    suggestion={suggestion}
                    busy={busy}
                    onAccept={(options) => onAccept(suggestion, options)}
                    onReject={() => run(() => decline(suggestion), t('rejectAction'))}
                  />
                ))}
              </div>
            </Group>
          )}

          {view.recommended.length > 0 && (
            <Group title={t('recommendedGroup')} count={view.recommended.length}>
              <p className="px-1 text-[13px] text-ink-tertiary">{t('recommendedHint')}</p>
              <div className="space-y-3">
                {view.recommended.map((suggestion) => (
                  <MatchCard
                    key={suggestion.movement.id}
                    suggestion={suggestion}
                    busy={busy}
                    onAccept={(options) => onAccept(suggestion, options)}
                    onReject={() => run(() => decline(suggestion), t('rejectAction'))}
                  />
                ))}
              </div>
            </Group>
          )}

          {view.unmatchedMovements.length > 0 && (
            <Group title={t('unmatchedGroup')} count={view.unmatchedMovements.length}>
              <div className="overflow-hidden rounded-2xl bg-surface-muted/60">
                {view.unmatchedMovements.map((movement) => (
                  <MovementRow
                    key={movement.id}
                    movement={movement}
                    busy={busy}
                    onCreate={() => setCreatingFrom(movement)}
                    onIgnore={() => run(() => ignore(movement), t('ignoreMovement'))}
                  />
                ))}
              </div>
            </Group>
          )}

          {view.unmatchedExpenses.length > 0 && (
            <Group title={t('pendingExpensesGroup')} count={view.unmatchedExpenses.length}>
              <div className="overflow-hidden rounded-2xl bg-surface-muted/60">
                {view.unmatchedExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center gap-3 px-4 py-3 [&+*]:border-t [&+*]:border-hairline"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{expense.description}</p>
                      <p className="text-[13px] text-ink-tertiary">{formatDate(expense.occurredOn)}</p>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold text-ink">
                      {formatCurrency(expense.amount, expense.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Group>
          )}

          {view.informational.length > 0 && (
            <Group title={t('otherChargesGroup')} count={view.informational.length}>
              <div className="overflow-hidden rounded-2xl bg-surface-muted/60">
                {view.informational.map((movement) => (
                  <MovementRow key={movement.id} movement={movement} />
                ))}
              </div>
            </Group>
          )}

          <Button variant="secondary" className="w-full" onClick={reset}>
            {t('importAnother')}
          </Button>
        </div>
      )}

      <CreateExpenseSheet
        movement={creatingFrom}
        onOpenChange={(open) => !open && setCreatingFrom(null)}
        onConfirm={async (input) => {
          if (!creatingFrom) return;
          await run(() => createExpense(creatingFrom, input), language === 'es' ? 'Gasto creado' : 'Expense created');
        }}
      />
    </PageShell>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-2 px-1 text-[13px] font-medium text-ink-tertiary">
        {title}
        <span className="text-ink-tertiary/70">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/** The count line, plus every warning the extraction produced. */
function Summary({ view }: { view: NonNullable<ReturnType<typeof useReconciliation>['view']> }) {
  const { t } = useLanguage();
  const total = view.movementCount;
  const check = view.meta.subtotalCheck;

  return (
    <div className="space-y-3 rounded-2xl bg-surface-muted/60 p-4">
      <p className="text-[17px] font-semibold text-ink">
        {total} {t('movementsAnalysed')}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink-secondary">
        {view.confirmed.length > 0 && (
          <span className="text-income">{view.confirmed.length} {t('reconciledCount')}</span>
        )}
        <span>{view.matches.length} {t('matchesFound')}</span>
        <span>{view.review.length} {t('toReview')}</span>
        {view.recommended.length > 0 && (
          <span>{view.recommended.length} {t('recommendedCount')}</span>
        )}
        <span>{view.unmatchedMovements.length} {t('notRegistered')}</span>
        <span>{view.unmatchedExpenses.length} {t('noCardMovement')}</span>
      </div>

      {view.alreadyImported && <Notice tone="info">{t('alreadyImported')}</Notice>}
      {view.duplicates > 0 && !view.alreadyImported && (
        <Notice tone="info">
          {view.duplicates} {t('duplicatesSkipped')}
        </Notice>
      )}
      {view.meta.needsReview.length > 0 && (
        <Notice tone="warn">
          {view.meta.needsReview.length} {t('needsReviewLines')}
        </Notice>
      )}
      {check && (
        <Notice tone={check.matches ? 'ok' : 'warn'}>
          {check.matches ? t('subtotalMatch') : t('subtotalMismatch')}
        </Notice>
      )}
      {view.aiConsulted > 0 && (
        <Notice tone="info">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          {view.aiConsulted} {t('aiConsultedNotice')}
        </Notice>
      )}
      {view.aiSkipped && view.aiSkipped !== 'no_ambiguity' && (
        <Notice tone="warn">{t('aiUnavailableNotice')}</Notice>
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const color =
    tone === 'ok' ? 'text-income' : tone === 'warn' ? 'text-amber-600' : 'text-ink-tertiary';
  return (
    <p className={`flex items-start gap-1.5 text-[13px] ${color}`}>
      {tone === 'ok' && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {tone === 'warn' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

/**
 * A failure the user can act on.
 *
 * "Error" tells them nothing; which of the three things went wrong tells them
 * whether to try a different file, unlock it, or report the format.
 */
function ImportError({ code, onRetry }: { code: ImportErrorCode | null; onRetry: () => void }) {
  const { t } = useLanguage();
  const headline =
    code === 'encrypted' ? t('statementEncrypted')
    : code === 'scanned' ? t('statementScanned')
    : t('statementUnreadable');

  return (
    <div className="space-y-4 rounded-2xl bg-surface-muted/60 p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
      <p className="text-[15px] font-medium text-ink">{headline}</p>
      <p className="text-[13px] text-ink-tertiary">{t('statementUnreadableHint')}</p>
      <Button variant="secondary" onClick={onRetry}>{t('tryAgain')}</Button>
    </div>
  );
}
