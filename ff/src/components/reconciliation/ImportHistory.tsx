import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';

import { formatDate } from '@/lib/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { listImports, loadImportProgress } from '@/services/reconciliation';

interface Props {
  onOpen: (importId: string) => void;
}

/**
 * The statements already imported.
 *
 * The reconciliation lives in the database, not in the screen's state, so
 * leaving mid-review costs nothing — this is the way back in. Without it the
 * only route to a half-finished statement was uploading the same PDF again.
 */
export function ImportHistory({ onOpen }: Props) {
  const { t } = useLanguage();

  const { data: imports = [] } = useQuery({
    queryKey: ['statement-imports'],
    queryFn: () => listImports(10),
  });

  const { data: progress } = useQuery({
    queryKey: ['statement-import-progress', imports.map((i) => i.id)],
    queryFn: () => loadImportProgress(imports.map((i) => i.id)),
    enabled: imports.length > 0,
  });

  if (imports.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[13px] font-medium text-ink-tertiary">{t('previousStatements')}</h2>
      <div className="overflow-hidden rounded-2xl bg-surface-muted/60">
        {imports.map((record) => {
          const counts = progress?.get(record.id);
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => onOpen(record.id)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-hairline/50 [&+*]:border-t [&+*]:border-hairline"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-secondary">
                <FileText className="h-[17px] w-[17px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">
                  {record.cardLast4 ? `•••• ${record.cardLast4}` : record.fileName}
                </span>
                <span className="block truncate text-[13px] text-ink-tertiary">
                  {record.closingDate ? formatDate(record.closingDate) : record.fileName}
                  {counts && ` · ${counts.confirmed} ${t('reconciledCount')}`}
                  {counts && counts.pending > 0 && ` · ${counts.pending} ${t('pendingCount')}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
