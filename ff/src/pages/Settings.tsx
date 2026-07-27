import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Languages,
  Mail,
  LogOut,
  Tag,
  Receipt,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase, isDemoMode } from '@/lib/supabase';
import { logoutUser } from '@/lib/demo';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';

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
    } else {
      toast.success(language === 'es' ? 'Sesión cerrada' : 'Signed out');
      window.location.href = '/auth';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link to={ROUTES.reports}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('settings')}</h1>
            <p className="text-sm text-slate-500">{t('settingsSubtitle')}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Languages className="h-4 w-4 text-slate-400" />
              {t('language')}
            </CardTitle>
            <CardDescription>{t('languageSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button
                variant={language === 'es' ? 'default' : 'outline'}
                onClick={() => setLanguage('es')}
              >
                ES
              </Button>
              <Button
                variant={language === 'en' ? 'default' : 'outline'}
                onClick={() => setLanguage('en')}
              >
                EN
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-slate-400" />
              {t('categories')}
            </CardTitle>
            <CardDescription>{t('categoriesSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={ROUTES.categories}>
              <Button variant="outline">
                {t('configure')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-slate-400" />
              {t('fixedExpenses')}
            </CardTitle>
            <CardDescription>{t('fixedExpensesSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={ROUTES.fixedExpenses}>
              <Button variant="outline">
                {t('configure')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-slate-400" />
              {t('usdBlue')}
            </CardTitle>
            <CardDescription>{t('usdBlueSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={ROUTES.exchangeRate}>
              <Button variant="outline">
                {t('configure')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-slate-400" />
              {language === 'es' ? 'Correo electrónico' : 'Email'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{email ?? '—'}</p>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full text-red-500 hover:bg-red-50 hover:text-red-600"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          {language === 'es' ? 'Cerrar sesión' : 'Sign out'}
        </Button>
      </div>
    </motion.div>
  );
}
