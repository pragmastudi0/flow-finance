import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase, isDemoMode } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ApiKeys {
  gemini?: string;
  groq?: string;
  openai?: string;
}

export function ApiKeyManager() {
  const { language } = useLanguage();
  const [keys, setKeys] = useState<ApiKeys>({});
  const [shown, setShown] = useState({ gemini: false, groq: false, openai: false });
  const [saving, setSaving] = useState(false);

  async function saveApiKeys() {
    if (isDemoMode()) {
      toast.info(language === 'es' ? 'Modo demo no soporta API keys' : 'Demo mode does not support API keys');
      return;
    }

    setSaving(true);
    try {
      await supabase.auth.updateUser({ data: { apiKeys: keys } });
      toast.success(language === 'es' ? 'API keys guardadas' : 'API keys saved');
    } catch (error) {
      console.error('Error saving API keys:', error);
      toast.error(language === 'es' ? 'Error al guardar' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {[
        { id: 'gemini', label: 'Google Gemini', placeholder: 'AIzaSy...' },
        { id: 'groq', label: 'Groq', placeholder: 'gsk_...' },
        { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
      ].map(({ id, label, placeholder }) => (
        <div key={id} className="border-b border-hairline pb-3">
          <label className="block text-sm font-medium text-ink-secondary mb-2">{label}</label>
          <div className="flex items-center gap-2">
            <Input
              type={shown[id as keyof typeof shown] ? 'text' : 'password'}
              placeholder={placeholder}
              value={(keys[id as keyof ApiKeys] as string) || ''}
              onChange={(e) => setKeys({ ...keys, [id]: e.target.value })}
              className="flex-1"
            />
            <button
              onClick={() => setShown({ ...shown, [id]: !shown[id as keyof typeof shown] })}
              className="p-2 hover:bg-surface-muted rounded transition-colors"
              aria-label={shown[id as keyof typeof shown] ? 'Hide' : 'Show'}
            >
              {shown[id as keyof typeof shown] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ))}

      <Button className="w-full mt-4" onClick={saveApiKeys} loading={saving}>
        {language === 'es' ? 'Guardar Claves' : 'Save Keys'}
      </Button>
    </div>
  );
}
