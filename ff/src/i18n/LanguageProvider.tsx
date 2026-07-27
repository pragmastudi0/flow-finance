import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  DEFAULT_LANGUAGE,
  dictionary,
  type Language,
  type TranslationKey,
} from './dictionary.ts';

interface LanguageValue {
  language: Language;
  setLanguage: (l: Language) => void;
  toggleLanguage: () => void;
  t: <K extends TranslationKey>(key: K) => (typeof dictionary)['en'][K];
}

const LanguageContext = createContext<LanguageValue | null>(null);

const STORAGE_KEY = 'language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'es' ? stored : DEFAULT_LANGUAGE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage((l) => (l === 'en' ? 'es' : 'en')),
      t: (key) => dictionary[language][key],
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

/** Category slugs are translation keys; custom category names are not. */
export function useCategoryLabel() {
  const { t } = useLanguage();
  return (category: string) => {
    const key = category as TranslationKey;
    return key in dictionary.en ? (t(key) as string) : category;
  };
}
