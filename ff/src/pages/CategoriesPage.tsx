import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { ROUTES } from '@/lib/routes';
import {
  useUserCategories,
  useCreateCategory,
  useDeleteCategory,
} from '@/hooks/useCategories';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_EMOJI_OPTIONS,
  CATEGORY_COLOR_OPTIONS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/domain/categories';
import type { TxType } from '@/domain/categories';

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

export default function CategoriesPage() {
  const { t, language } = useLanguage();
  const { data: userCategories = [] } = useUserCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#64748b');
  const [type, setType] = useState<TxType>('expense');

  const builtInCategories = [
    ...EXPENSE_CATEGORIES.map((c) => ({ name: c, type: 'expense' as const })),
    ...INCOME_CATEGORIES.map((c) => ({ name: c, type: 'income' as const })),
  ];

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('name') + ' ' + (t('save')));
      return;
    }
    await createCategory.mutateAsync({ name: name.trim(), icon, color, type });
    toast.success(t('save'));
    setDialogOpen(false);
    setName('');
    setIcon('💰');
    setColor('#64748b');
    setType('expense');
  };

  const handleDelete = async (id: string) => {
    await deleteCategory.mutateAsync(id);
    toast.success(t('delete'));
  };

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <PageHeader title={t('categoriesTitle')} subtitle={t('categoriesPageSubtitle')} back={ROUTES.settings} />
          </div>
          <div className="shrink-0 pt-6">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" aria-label={t('addCategory')}>
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('newCategory')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-ink">
                    {t('type')}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant={type === 'expense' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setType('expense')}
                    >
                      {t('expenseType')}
                    </Button>
                    <Button
                      type="button"
                      variant={type === 'income' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setType('income')}
                    >
                      {t('incomeType')}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-ink">
                    {t('name')}
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('name')}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-ink">
                    {t('icon')}
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {CATEGORY_EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcon(emoji)}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-colors',
                          icon === emoji
                            ? 'bg-hairline ring-2 ring-ink'
                            : 'hover:bg-surface-muted',
                        )}
                        aria-label={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-ink">
                    {t('color')}
                  </label>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {CATEGORY_COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.hex)}
                        className={cn(
                          'h-10 w-10 rounded-full transition-transform',
                          color === c.hex && 'scale-125 ring-2 ring-ink ring-offset-2',
                        )}
                        style={{ backgroundColor: c.hex }}
                        aria-label={c.value}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t('cancel')}</Button>
                </DialogClose>
                <Button onClick={handleCreate} loading={createCategory.isPending}>
                  {t('add')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
            {t('defaultCategory')}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {builtInCategories.map((cat) => (
              <div
                key={cat.name}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-white px-4 py-3"
              >
                <span className="text-lg">
                  {CATEGORY_ICONS[cat.name] || '📄'}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">
                    {t(cat.name as any)}
                  </p>
                  <p className="text-xs text-ink-tertiary">
                    {cat.type === 'expense' ? t('expenseType') : t('incomeType')}
                  </p>
                </div>
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: CATEGORY_COLORS[cat.name] || '#64748b',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {userCategories.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
              {language === 'es' ? 'Tus categorías' : 'Your categories'}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {userCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-white px-4 py-3"
                >
                  <span className="text-lg">{cat.icon || '📄'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">
                      {cat.name}
                    </p>
                    <p className="text-xs text-ink-tertiary">
                      {cat.type === 'expense' ? t('expenseType') : t('incomeType')}
                    </p>
                  </div>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cat.color || '#64748b' }}
                  />
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-tertiary hover:bg-expense/10 hover:text-expense"
                    aria-label={t('delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {userCategories.length === 0 && builtInCategories.length > 0 && (
          <div className="rounded-lg border border-dashed border-hairline py-8 text-center text-sm text-ink-tertiary">
            {language === 'es'
              ? 'No creaste categorías personalizadas todavía'
              : 'No custom categories yet'}
          </div>
        )}
      </div>
    </PageShell>
  );
}
