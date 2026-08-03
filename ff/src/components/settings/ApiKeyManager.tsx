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
  provider?: string;
}

export function ApiKeyManager() {
  const { language } = useLanguage();
  const [keys, setKeys] = useState<ApiKeys>({});
  const [shown, setShown] = useState<Record<string, boolean>>({
    gemini: false,
    groq: false,
    openai: false,
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

      toast.success(language === 'es' ? 'API keys guardadas' : 'API keys saved');
    } catch (error) {
      console.error('Error saving API keys:', error);
      toast.error(language === 'es' ? 'Error al guardar' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const isEdited = JSON.stringify(keys) !== JSON.stringify({});

  if (loading) {
    return (
      <ListGroup>
        <ListRow label={language === 'es' ? 'Cargando...' : 'Loading...'} />
      </ListGroup>
    );
  }

  return (
    <div className="space-y-4">
      <ListGroup title={language === 'es' ? 'Claves API' : 'API Keys'}>
        {[
          { id: 'gemini', label: 'Google Gemini', placeholder: 'AIzaSy...' },
          { id: 'groq', label: 'Groq', placeholder: 'gsk_...' },
          { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
        ].map(({ id, label, placeholder }) => (
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
            onClick={() => loadApiKeys()}
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
