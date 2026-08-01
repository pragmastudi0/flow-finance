import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, ArrowLeft, Receipt, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { useFixedExpenses, useCreateFixedExpense, useToggleFixedExpense } from '@/hooks/useFixedExpenses';
import { EXPENSE_CATEGORIES } from '@/domain/categories';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

export default function FixedExpenses() {
  const { t, language } = useLanguage();
  const label = useCategoryLabel();
  const { data: fixedExpenses = [] } = useFixedExpenses();
  const createFixedExpense = useCreateFixedExpense();
  const toggleFixedExpense = useToggleFixedExpense();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [recurrence, setRecurrence] = useState<'installments' | 'subscription'>('subscription');
  const [startDate, setStartDate] = useState('');
  const [installments, setInstallments] = useState('');

  const handleCreate = async () => {
    if (!description || !amount || !startDate) {
      toast.error(language === 'es' ? 'Completa todos los campos' : 'Fill all fields');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(language === 'es' ? 'Monto inválido' : 'Invalid amount');
      return;
    }
    await createFixedExpense.mutateAsync({
      description: description.trim(),
      amount: numAmount,
      currency,
      category,
      recurrence,
      start_date: startDate,
      installments: recurrence === 'installments' ? parseInt(installments) || null : null,
    });
    toast.success(t('save'));
    setOpen(false);
    setDescription('');
    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setRecurrence('subscription');
    setStartDate('');
    setInstallments('');
  };

  const handleToggle = async (id: string, status: string) => {
    const newStatus = status === 'active' ? 'cancelled' : 'active';
    await toggleFixedExpense.mutateAsync({ id, status: newStatus as any });
    toast.success(t('save'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="pb-nav min-h-full bg-surface p-4 sm:p-6"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/Settings">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('fixedExpenses')}</h1>
              <p className="text-sm text-slate-500">{t('fixedExpensesSubtitle')}</p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                {t('newFixedExpense')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('newFixedExpense')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {t('description')}
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Netflix"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      {t('amount')}
                    </label>
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="1500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      {t('currency')}
                    </label>
                    <Input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="ARS"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {t('category')}
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          category === cat
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        )}
                      >
                        {label(cat)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {t('type')}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant={recurrence === 'subscription' ? 'default' : 'outline'}
                      onClick={() => setRecurrence('subscription')}
                    >
                      {t('subscriptionOption')}
                    </Button>
                    <Button
                      type="button"
                      variant={recurrence === 'installments' ? 'default' : 'outline'}
                      onClick={() => setRecurrence('installments')}
                    >
                      {t('installmentsOption')}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      {t('startDate')}
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  {recurrence === 'installments' && (
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        {t('installmentCount')}
                      </label>
                      <Input
                        type="number"
                        value={installments}
                        onChange={(e) => setInstallments(e.target.value)}
                        placeholder="12"
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t('cancel')}</Button>
                </DialogClose>
                <Button onClick={handleCreate} loading={createFixedExpense.isPending}>
                  {t('save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {fixedExpenses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Receipt className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">{t('noFixedExpenses')}</p>
              <p className="text-xs text-slate-400">{t('noFixedExpensesHint')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {fixedExpenses.map((fe) => (
              <div
                key={fe.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border bg-white px-4 py-3 transition-colors',
                  fe.status === 'cancelled' && 'opacity-50',
                )}
              >
                <div className="flex items-center gap-3">
                  <Receipt className="h-5 w-5 text-slate-300" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {fe.description}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{label(fe.category)}</span>
                      <span>·</span>
                      <span>
                        {fe.recurrence === 'installments'
                          ? `${fe.installments ?? '?'} ${t('installments')}`
                          : t('subscriptionOption')}
                      </span>
                      <span>·</span>
                      <span>{fe.startDate ? formatDate(fe.startDate) : ''}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(fe.amount, fe.currency)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      fe.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : fe.status === 'cancelled'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {fe.status}
                  </span>
                  <button
                    onClick={() => handleToggle(fe.id, fe.status)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                    aria-label={fe.status === 'active' ? 'Cancelar' : 'Activar'}
                  >
                    {fe.status === 'active' ? (
                      <ToggleRight className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-6 w-6" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
