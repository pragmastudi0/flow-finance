import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  useExchangeRateConfig,
  useSaveExchangeRateConfig,
  useExchangeRateHistory,
} from '@/hooks/useExchangeRate';
import { formatCurrency, formatDateFull } from '@/lib/format';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ExchangeRate() {
  const { t, language } = useLanguage();
  const { data: config } = useExchangeRateConfig();
  const { data: history = [] } = useExchangeRateHistory();
  const saveConfig = useSaveExchangeRateConfig();

  const [sourceUrl, setSourceUrl] = useState('');
  const [refreshMinutes, setRefreshMinutes] = useState('60');

  useEffect(() => {
    if (config) {
      setSourceUrl(config.sourceUrl ?? '');
      setRefreshMinutes(String(config.refreshMinutes ?? 60));
    }
  }, [config]);

  const handleSave = async () => {
    if (!sourceUrl.trim()) {
      toast.error(language === 'es' ? 'Ingresá una URL' : 'Enter a URL');
      return;
    }
    const mins = parseInt(refreshMinutes);
    if (isNaN(mins) || mins < 15) {
      toast.error(
        language === 'es'
          ? 'El intervalo mínimo es 15 minutos'
          : 'Minimum interval is 15 minutes',
      );
      return;
    }
    await saveConfig.mutateAsync({
      source_url: sourceUrl.trim(),
      refresh_minutes: mins,
    });
    toast.success(t('configurationSaved'));
  };

  const handleUpdateNow = () => {
    toast.success(
      language === 'es' ? 'Actualización solicitada' : 'Update requested',
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/Settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('exchangeRateTitle')}
            </h1>
            <p className="text-sm text-slate-500">{t('exchangeRateSubtitle')}</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-slate-400" />
              {t('currentRate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-900">
                  {config?.lastValue != null
                    ? formatCurrency(config.lastValue, 'ARS')
                    : t('noValueYet')}
                </p>
                {config?.lastUpdatedAt && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t('lastUpdated')}
                    {formatDateFull(config.lastUpdatedAt)}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdateNow}
              >
                <RefreshCw className="h-4 w-4" />
                {t('updateNow')}
              </Button>
            </div>
            {config?.lastStatus && config.lastStatus !== 'pending' && (
              <div
                className={cn(
                  'mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  config.lastStatus === 'ok'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700',
                )}
              >
                {config.lastStatus === 'ok'
                  ? 'OK'
                  : config.lastError ?? 'Error'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-slate-400" />
              {t('configuration')}
            </CardTitle>
            <CardDescription>{t('configurationHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                {t('sourceUrl')}
              </label>
              <p className="mb-1 text-xs text-slate-400">{t('sourceUrlHint')}</p>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://api.example.com/dolar-blue"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                {t('refreshEvery')}
              </label>
              <p className="mb-1 text-xs text-slate-400">{t('refreshHint')}</p>
              <Input
                type="number"
                value={refreshMinutes}
                onChange={(e) => setRefreshMinutes(e.target.value)}
                min={15}
                className="w-32"
              />
            </div>
            <Button onClick={handleSave} loading={saveConfig.isPending}>
              {t('saveConfiguration')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('recentHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                {t('noData')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-4 py-3 sm:py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-400">
                        {entry.capturedAt ? formatDateFull(entry.capturedAt) : '—'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span className="text-sm text-slate-700">
                          {language === 'es' ? 'Compra:' : 'Buy:'}{' '}
                          <span className="font-medium">
                            {entry.rateBuy != null ? formatCurrency(entry.rateBuy) : '—'}
                          </span>
                        </span>
                        <span className="text-sm text-slate-700">
                          {language === 'es' ? 'Venta:' : 'Sell:'}{' '}
                          <span className="font-medium">
                            {entry.rateSell != null ? formatCurrency(entry.rateSell) : '—'}
                          </span>
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        entry.status === 'ok'
                          ? 'bg-emerald-100 text-emerald-700'
                          : entry.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700',
                      )}
                    >
                      {entry.status === 'ok'
                        ? 'OK'
                        : entry.status === 'pending'
                          ? t('pending')
                          : 'Error'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
