import { useMemo, useState } from 'react';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { monthKey, useAiChat, useAiReport, useGenerateAiReport } from '@/hooks/useAiInsights';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ReportBody } from '@/components/ai/ReportBody';
import { AnalyzingState, ReportSkeleton } from '@/components/ai/AnalyzingState';
import { AiChatSheet, AskAiButton } from '@/components/ai/AiChatSheet';
import type { AiError } from '@/services/ai';

function ErrorState({ error, onRetry }: { error: AiError; onRetry: () => void }) {
  const { language } = useLanguage();
  const es = language === 'es';

  const message =
    error.code === 'no_data'
      ? es
        ? 'Todavía no hay movimientos este mes para analizar.'
        : 'No transactions this month to analyse yet.'
      : error.code === 'unavailable'
        ? es
          ? 'El análisis con IA necesita Supabase configurado (no está disponible en modo demo).'
          : 'AI analysis requires Supabase to be configured (not available in demo mode).'
        : error.code === 'offline'
          ? es
            ? 'Sin conexión. Revisá tu red e intentá de nuevo.'
            : 'No connection. Check your network and try again.'
          : es
            ? 'No pude generar el análisis. Probá de nuevo en un momento.'
            : 'Could not generate the analysis. Please try again shortly.';

  const retryable = error.code !== 'no_data' && error.code !== 'unavailable';

  return (
    <div className="py-16 text-center">
      <p className="mx-auto max-w-xs text-[15px] leading-relaxed text-ink-tertiary">{message}</p>
      {retryable && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          {es ? 'Reintentar' : 'Retry'}
        </Button>
      )}
    </div>
  );
}

export default function AiInsights() {
  const { language } = useLanguage();
  const es = language === 'es';

  const month = useMemo(() => monthKey(new Date()), []);
  const { data, isLoading, error } = useAiReport(month);
  const generate = useGenerateAiReport(month);
  const chat = useAiChat(month);
  const [chatOpen, setChatOpen] = useState(false);

  const report = data?.report;
  const failure = (generate.error ?? error) as AiError | null;


  return (
    <>
      <PageShell>
        <PageHeader
          title={es ? 'AI Insights' : 'AI Insights'}
          subtitle={es ? 'Tu asesor financiero' : 'Your financial adviser'}
          action={
            report && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                aria-label={es ? 'Generar nuevo análisis' : 'Generate new analysis'}
              >
                <RefreshCw className={cn('h-[18px] w-[18px]', generate.isPending && 'animate-spin')} />
              </Button>
            )
          }
        />

        {generate.isPending ? (
          <AnalyzingState />
        ) : isLoading ? (
          <ReportSkeleton />
        ) : !report ? (
          failure ? (
            <ErrorState error={failure} onRetry={() => generate.mutate()} />
          ) : null
        ) : (
          <div className="space-y-9 print:space-y-6">
            <ReportBody report={report} />

            {/* The floating "ask" pill sits ~144px off the bottom, so the last
                action needs to clear it or the two overlap. */}
            <div data-print-hide className="space-y-3 pb-20 pt-2">
              <Button
                className="w-full"
                onClick={() => generate.mutate()}
                loading={generate.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {es ? 'Generar nuevo análisis' : 'Generate new analysis'}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => window.print()}>
                <FileText className="h-4 w-4" />
                {es ? 'Exportar reporte IA' : 'Export AI report'}
              </Button>
              {data?.generatedAt && (
                <p className="pt-1 text-center text-[12px] text-ink-tertiary">
                  {es ? 'Generado el ' : 'Generated '}
                  {new Date(data.generatedAt).toLocaleString(es ? 'es-AR' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
        )}
      </PageShell>

      {report && <AskAiButton onClick={() => setChatOpen(true)} />}

      <AiChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        messages={chat.messages}
        onSend={chat.send}
        pending={chat.pending}
        error={chat.error}
      />
    </>
  );
}
