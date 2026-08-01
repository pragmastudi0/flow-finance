import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Target, ArrowLeft, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { differenceInDays, parseISO } from 'date-fns';

import { useLanguage } from '@/i18n/LanguageProvider';
import { useSavingsGoals, useCreateGoal, useContributeToGoal } from '@/hooks/useSavings';
import { formatCurrency, formatDateFull } from '@/lib/format';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

export default function Savings() {
  const { t, language } = useLanguage();
  const { data: goals = [] } = useSavingsGoals();
  const createGoal = useCreateGoal();
  const contribute = useContributeToGoal();

  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const [contributeId, setContributeId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeOpen, setContributeOpen] = useState(false);

  const handleCreateGoal = async () => {
    if (!description || !goalAmount || !targetDate) {
      toast.error(language === 'es' ? 'Completa todos los campos' : 'Fill all fields');
      return;
    }
    const amount = parseFloat(goalAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(language === 'es' ? 'Monto inválido' : 'Invalid amount');
      return;
    }
    await createGoal.mutateAsync({
      description,
      goal_amount: amount,
      target_date: targetDate,
    });
    toast.success(t('save'));
    setNewGoalOpen(false);
    setDescription('');
    setGoalAmount('');
    setTargetDate('');
  };

  const handleContribute = async () => {
    if (!contributeId || !contributeAmount) return;
    const amount = parseFloat(contributeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(language === 'es' ? 'Monto inválido' : 'Invalid amount');
      return;
    }
    await contribute.mutateAsync({ goal_id: contributeId, amount });
    toast.success(t('save'));
    setContributeOpen(false);
    setContributeAmount('');
    setContributeId(null);
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
            <Link to="/Reports">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('savings')}</h1>
              <p className="text-sm text-slate-500">{t('savingsSubtitle')}</p>
            </div>
          </div>
          <Dialog open={newGoalOpen} onOpenChange={setNewGoalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                {t('newGoal')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('newGoal')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {t('description')}
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={language === 'es' ? 'Ej: Viaje a Japón' : 'e.g. Trip to Japan'}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {t('goalAmount')}
                  </label>
                  <Input
                    type="number"
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder="$ 100000"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {t('targetDate')}
                  </label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t('cancel')}</Button>
                </DialogClose>
                <Button onClick={handleCreateGoal} loading={createGoal.isPending}>
                  {t('save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {goals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <PiggyBank className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">{t('noGoals')}</p>
              <p className="text-xs text-slate-400">{t('noGoalsHint')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.map((goal) => {
              const daysLeft = differenceInDays(
                parseISO(goal.targetDate),
                new Date(),
              );
              const isOverdue = daysLeft < 0;
              const progress = Math.min(goal.progressPct ?? 0, 100);

              return (
                <Card key={goal.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {goal.description}
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDateFull(goal.targetDate)}
                        </p>
                      </div>
                      <Target className="h-5 w-5 text-slate-300" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          backgroundColor:
                            progress >= 100
                              ? '#22c55e'
                              : isOverdue
                                ? '#ef4444'
                                : '#3b82f6',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900">
                        {formatCurrency(goal.currentSavedAmount ?? 0)}
                      </span>
                      <span className="text-slate-400">
                        / {formatCurrency(goal.goalAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={
                          isOverdue ? 'font-medium text-red-500' : 'text-slate-400'
                        }
                      >
                        {isOverdue
                          ? t('overdue')
                          : `${daysLeft} ${t('daysLeft')}`}
                      </span>
                      <span className="font-medium text-slate-600">
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <Dialog
                      open={contributeOpen && contributeId === goal.id}
                      onOpenChange={(open) => {
                        setContributeOpen(open);
                        if (!open) setContributeId(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setContributeId(goal.id);
                            setContributeOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          {t('add')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            {language === 'es' ? 'Agregar aporte' : 'Add contribution'}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <label className="text-sm font-medium text-slate-700">
                            {t('amount')}
                          </label>
                          <Input
                            type="number"
                            value={contributeAmount}
                            onChange={(e) => setContributeAmount(e.target.value)}
                            placeholder="$ 5000"
                            autoFocus
                          />
                        </div>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">{t('cancel')}</Button>
                          </DialogClose>
                          <Button
                            onClick={handleContribute}
                            loading={contribute.isPending}
                          >
                            {t('save')}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
