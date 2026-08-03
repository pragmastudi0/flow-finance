import { useEffect, useState } from 'react';
import { Languages, LogOut, Tag, Receipt, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase, isDemoMode } from '@/lib/supabase';
import { logoutUser } from '@/lib/demo';
import { ROUTES } from '@/lib/routes';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListGroup, ListRow } from '@/components/layout/ListGroup';
import { AnimatedSegment } from '@/components/money/AnimatedSegment';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';

export default function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  const handleSignOut = async () => {
    if (isDemoMode()) {
      logoutUser();
      toast.success(language === 'es' ? 'Sesión cerrada' : 'Signed out');
      window.location.href = '/auth';
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(language === 'es' ? 'Sesión cerrada' : 'Signed out');
    window.location.href = '/auth';
  };

  return (
    <PageShell>
      <PageHeader title={t('settings')} subtitle={t('settingsSubtitle')} />

      <div className="space-y-7">
        <ListGroup>
          <ListRow
            icon={Tag}
            label={t('categories')}
            description={t('categoriesSubtitle')}
            to={ROUTES.categories}
          />
          <ListRow
            icon={Receipt}
            label={t('fixedExpenses')}
            description={t('fixedExpensesSubtitle')}
            to={ROUTES.fixedExpenses}
          />
          <ListRow
            icon={DollarSign}
            label={t('usdBlue')}
            description={t('usdBlueSubtitle')}
            to={ROUTES.exchangeRate}
          />
        </ListGroup>

        <div>
          <h3 className="px-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
            {t('apiKeys')}
          </h3>
          <ApiKeyManager />
        </div>

        <ListGroup title={t('language')}>
          <ListRow
            icon={Languages}
            label={t('language')}
            trailing={
              <div className="w-32 shrink-0">
                <AnimatedSegment
                  options={[
                    { value: 'es' as const, label: 'ES' },
                    { value: 'en' as const, label: 'EN' },
                  ]}
                  value={language}
                  onChange={setLanguage}
                  ariaLabel={t('language')}
                />
              </div>
            }
          />
        </ListGroup>

        <ListGroup>
          <ListRow
            label={language === 'es' ? 'Correo electrónico' : 'Email'}
            value={email ?? '—'}
          />
          <ListRow
            icon={LogOut}
            label={language === 'es' ? 'Cerrar sesión' : 'Sign out'}
            onClick={handleSignOut}
            destructive
          />
        </ListGroup>
      </div>
    </PageShell>
  );
}
