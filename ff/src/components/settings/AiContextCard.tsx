import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase, isDemoMode } from '@/lib/supabase';
import { AI_CONTEXT_MAX, sanitizeAiContext } from '@/domain/aiContext';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/layout/ListGroup';

const PLACEHOLDER_ES = `Ej.: Vendo tecnología, así que tengo muchos gastos de flete y de envíos: son costo del negocio, no un gasto personal.
No tengo sueldo fijo; mis ingresos dependen de cuánto venda en el mes y de la ganancia, así que varían bastante.`;

const PLACEHOLDER_EN = `E.g.: I sell technology, so I have a lot of freight and shipping costs — they are a cost of the business, not personal spending.
I have no fixed salary; my income depends on how much I sell each month and on the margin, so it varies a lot.`;

/**
 * The context the user writes about their own situation.
 *
 * Stored in `user_metadata` next to the API keys, which is what the report and
 * chat functions already read — so there is no extra table and nothing to
 * migrate. The saved report is cached per month, so the hint says to
 * regenerate it for the new context to show up.
 */
export function AiContextCard() {
  const { language } = useLanguage();
  const es = language === 'es';
  const [text, setText] = useState('');
  /** What's persisted, so "edited" means changed rather than merely non-empty. */
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const context = sanitizeAiContext(data.user?.user_metadata?.aiContext);
        setText(context);
        setSaved(context);
      })
      .catch((error) => console.error('Error loading AI context:', error))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (isDemoMode()) {
      toast.info(es ? 'El modo demo no guarda el contexto' : 'Demo mode does not save context');
      return;
    }

    const value = sanitizeAiContext(text);
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { aiContext: value } });
      if (error) throw error;

      setText(value);
      setSaved(value);
      toast.success(
        es
          ? 'Contexto guardado. Volvé a generar el análisis para aplicarlo.'
          : 'Context saved. Generate the analysis again to apply it.',
      );
    } catch (error) {
      console.error('Error saving AI context:', error);
      toast.error(es ? 'Error al guardar' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ListGroup>
        <ListRow label={es ? 'Cargando...' : 'Loading...'} />
      </ListGroup>
    );
  }

  return (
    <div className="space-y-4">
      <ListGroup>
        <div className="px-4 py-3">
          <p className="mb-3 text-sm text-ink-secondary">
            {es
              ? 'Contá a qué te dedicás y cómo son tus ingresos y gastos. La IA lo usa al analizar el mes y al responder en el chat.'
              : 'Describe what you do and how your income and expenses work. The AI uses it when analysing the month and when answering in chat.'}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, AI_CONTEXT_MAX))}
            maxLength={AI_CONTEXT_MAX}
            rows={6}
            placeholder={es ? PLACEHOLDER_ES : PLACEHOLDER_EN}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="mt-2 text-right text-xs text-ink-tertiary">
            {text.length}/{AI_CONTEXT_MAX}
          </p>
        </div>
      </ListGroup>

      {sanitizeAiContext(text) !== saved && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setText(saved)} disabled={saving}>
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button className="flex-1" onClick={save} loading={saving}>
            {es ? 'Guardar' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
