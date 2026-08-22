import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase, isDemoMode } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/layout/ListGroup';

interface ApiKeys {
  gemini?: string;
  groq?: string;
  openai?: string;
  anthropic?: string;
  provider?: string;
}

const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIzaSy...' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
] as const;

export function ApiKeyManager() {
  const { language } = useLanguage();
  const [keys, setKeys] = useState<ApiKeys>({});
  /** What's persisted, so "edited" means changed rather than merely non-empty. */
  const [saved, setSaved] = useState<ApiKeys>({});
  const [shown, setShown] = useState<Record<string, boolean>>({
    gemini: false,
    groq: false,
    openai: false,
    anthropic: false,
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    loadApiKeys();
  }, []);

  async function loadApiKeys() {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      const apiKeys = data.user.user_metadata?.apiKeys ?? {};
      setKeys(apiKeys);
      setSaved(apiKeys);
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveApiKeys() {
    if (isDemoMode()) {
      toast.info(language === 'es' ? 'Modo demo no soporta API keys' : 'Demo mode does not support API keys');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          apiKeys: keys,
        },
      });

      if (error) throw error;

      setSaved(keys);
      toast.success(language === 'es' ? 'API keys guardadas' : 'API keys saved');
    } catch (error) {
      console.error('Error saving API keys:', error);
      toast.error(language === 'es' ? 'Error al guardar' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const isEdited = JSON.stringify(keys) !== JSON.stringify(saved);

  if (loading) {
    return (
      <ListGroup>
        <ListRow label={language === 'es' ? 'Cargando...' : 'Loading...'} />
      </ListGroup>
    );
  }

  return (
    <div className="space-y-4">
      <ListGroup title={language === 'es' ? 'Proveedor activo' : 'Active provider'}>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {PROVIDERS.map(({ id, label }) => {
            const active = (keys.provider ?? 'gemini') === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setKeys({ ...keys, provider: id })}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  active
                    ? 'bg-ink text-surface border-ink'
                    : 'border-hairline text-ink-secondary hover:bg-surface-muted'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </ListGroup>

      <ListGroup title={language === 'es' ? 'Claves API' : 'API Keys'}>
        {PROVIDERS.map(({ id, label, placeholder }) => (
          <div key={id} className="border-b border-hairline px-4 py-3 last:border-0">
            <label className="block text-sm font-medium text-ink-secondary mb-2">{label}</label>
            <div className="flex items-center gap-2">
              <Input
                type={shown[id] ? 'text' : 'password'}
                placeholder={placeholder}
                value={(keys[id as keyof ApiKeys] as string) || ''}
                onChange={(e) => setKeys({ ...keys, [id]: e.target.value })}
                className="flex-1"
              />
              <button
                onClick={() => setShown({ ...shown, [id]: !shown[id] })}
                className="p-2 hover:bg-surface-muted rounded transition-colors"
                aria-label={shown[id] ? 'Hide' : 'Show'}
              >
                {shown[id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
      </ListGroup>

      {isEdited && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setKeys(saved)}
            disabled={saving}
          >
            {language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            className="flex-1"
            onClick={saveApiKeys}
            loading={saving}
          >
            {language === 'es' ? 'Guardar' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
