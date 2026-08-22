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
  CategoryError,
  type CategoryErrorCode,
} from '@/hooks/useCategories';
import { useReservedCategoryNames } from '@/hooks/useCategoryOptions';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_EMOJI_OPTIONS,
  CATEGORY_COLOR_OPTIONS,
  DEFAULT_CATEGORY_COLOR,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/domain/categories';
import type { TxType } from '@/domain/categories';
import {
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORY_ICON,
  validateCategoryName,
  type NameProblem,
} from '@/domain/categoryOptions';
import type { Category } from '@/types/models';
import type { TranslationKey } from '@/i18n/dictionary';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

/** What to tell the user for each way saving can fail. */
const NAME_PROBLEM_KEYS: Record<NameProblem, TranslationKey> = {
  empty: 'nameRequired',
  tooLong: 'nameTooLong',
  taken: 'categoryExists',
};

const SAVE_ERROR_KEYS: Record<CategoryErrorCode, TranslationKey> = {
  duplicate: 'categoryExists',
  tooLong: 'nameTooLong',
  auth: 'sessionExpired',
  offline: 'connectionError',
  unknown: 'categorySaveFailed',
};

export default function CategoriesPage() {
  const { t } = useLanguage();
  const { data: userCategories = [], isLoading } = useUserCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [type, setType] = useState<TxType>('expense');
  const [nameError, setNameError] = useState<string | null>(null);

  const reserved = useReservedCategoryNames(type);
  const colorNames = t('colorNames');
  /** `t` widens to the whole dictionary when the key is a variable. */
  const message = (key: TranslationKey) => t(key) as string;

  const builtInCategories = [
    ...EXPENSE_CATEGORIES.map((c) => ({ name: c, type: 'expense' as const })),
    ...INCOME_CATEGORIES.map((c) => ({ name: c, type: 'income' as const })),
  ];

  const resetForm = () => {
    setName('');
    setIcon(DEFAULT_CATEGORY_ICON);
    setColor(DEFAULT_CATEGORY_COLOR);
    setType('expense');
    setNameError(null);
  };

  const handleCreate = async () => {
    // Checked here so the common mistakes never cost a round trip — the DB
    // still has the last word, and `catch` below turns that into the same
    // message instead of the silence this used to end in.
    const problem = validateCategoryName(name, type, userCategories, reserved);
    if (problem) {
      setNameError(message(NAME_PROBLEM_KEYS[problem]));
      return;
    }

    try {
      await createCategory.mutateAsync({ name: name.trim(), icon, color, type });
    } catch (error) {
      const code = error instanceof CategoryError ? error.code : 'unknown';
      const text = message(SAVE_ERROR_KEYS[code]);
      // A name the server rejected belongs next to the field, not in a toast
      // that scrolls away from it.
      if (code === 'duplicate' || code === 'tooLong') setNameError(text);
      else toast.error(text);
      return;
    }

    toast.success(t('categoryCreated'));
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (category: Category) => {
    try {
      await deleteCategory.mutateAsync(category.id);
    } catch (error) {
      const code = error instanceof CategoryError ? error.code : 'unknown';
      toast.error(
        code === 'offline' || code === 'auth'
          ? message(SAVE_ERROR_KEYS[code])
          : t('categoryDeleteFailed'),
      );
      return;
    }

    // Transactions keep the category by name, so a delete is only ever one
    // mis-tap away from orphaning them — it has to be undoable, the same way
    // deleting a transaction is.
    toast.success(t('categoryDeleted'), {
      action: {
        label: t('undo'),
        onClick: () => {
          createCategory.mutate(
            {
              name: category.name,
              icon: category.icon,
              color: category.color,
              type: category.type,
            },
            {
              onSuccess: () => toast.success(t('categoryRestored')),
              onError: () => toast.error(t('categorySaveFailed')),
            },
          );
        },
      },
    });
  };

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <PageHeader title={t('categoriesTitle')} subtitle={t('categoriesPageSubtitle')} back={ROUTES.settings} />
          </div>
          <div className="shrink-0 pt-6">
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="icon" aria-label={t('addCategory')}>
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('newCategory')}</DialogTitle>
                <DialogDescription>{t('newCategoryHint')}</DialogDescription>
              </DialogHeader>
              {/* A real form, so Enter submits from the name field. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreate();
                }}
              >
                {/* `pb-24` clears the sticky footer, so the last field can
                    always be scrolled out from under it. */}
                <div className="space-y-4 pb-24 pt-4">
                  <div>
                    <span className="text-sm font-medium text-ink">{t('type')}</span>
                    <div className="mt-1 flex gap-2">
                      <Button
                        type="button"
                        variant={type === 'expense' ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={type === 'expense'}
                        onClick={() => { setType('expense'); setNameError(null); }}
                      >
                        {t('expenseType')}
                      </Button>
                      <Button
                        type="button"
                        variant={type === 'income' ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={type === 'income'}
                        onClick={() => { setType('income'); setNameError(null); }}
                      >
                        {t('incomeType')}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="category-name" className="text-sm font-medium text-ink">
                      {t('name')}
                    </label>
                    <Input
                      id="category-name"
                      value={name}
                      maxLength={CATEGORY_NAME_MAX}
                      aria-invalid={nameError !== null}
                      aria-describedby={nameError ? 'category-name-error' : undefined}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (nameError) setNameError(null);
                      }}
                      placeholder={t('name')}
                    />
                    {nameError && (
                      <p id="category-name-error" role="alert" className="mt-1 text-sm text-expense">
                        {nameError}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="text-sm font-medium text-ink">{t('icon')}</span>
                    {/* Sixty-five emoji in one block pushed the submit button
                        below the fold on every phone; the picker scrolls on its
                        own so the form stays a form. */}
                    <div className="mt-1 flex max-h-[152px] flex-wrap gap-2 overflow-y-auto overscroll-contain rounded-lg border border-hairline p-2">
                      {CATEGORY_EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setIcon(emoji)}
                          aria-pressed={icon === emoji}
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
                    <span className="text-sm font-medium text-ink">{t('color')}</span>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {CATEGORY_COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setColor(c.hex)}
                          aria-pressed={color === c.hex}
                          className={cn(
                            'h-10 w-10 rounded-full transition-transform',
                            color === c.hex && 'scale-125 ring-2 ring-ink ring-offset-2',
                          )}
                          style={{ backgroundColor: c.hex }}
                          aria-label={colorNames[c.value] ?? c.value}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sticky, so the primary action is on screen no matter how
                    far down the picker the user has scrolled. */}
                <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 gap-2 border-t border-hairline bg-background px-6 py-4">
                  <DialogClose asChild>
                    <Button type="button" variant="outline">{t('cancel')}</Button>
                  </DialogClose>
                  <Button type="submit" loading={createCategory.isPending}>
                    {t('add')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* The user's own categories come first: they are why anyone opens this
            screen, and below fifteen built-ins a new one lands off-screen. */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
            {t('yourCategories')}
          </h2>
          {isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[58px] animate-pulse rounded-lg bg-surface-muted" />
              ))}
            </div>
          ) : userCategories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline py-8 text-center text-sm text-ink-tertiary">
              {t('noCustomCategories')}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {userCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-white px-4 py-3"
                >
                  <span className="text-lg">{cat.icon || DEFAULT_CATEGORY_ICON}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {cat.name}
                    </p>
                    <p className="text-xs text-ink-tertiary">
                      {cat.type === 'expense' ? t('expenseType') : t('incomeType')}
                    </p>
                  </div>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cat.color || DEFAULT_CATEGORY_COLOR }}
                  />
                  <button
                    onClick={() => void handleDelete(cat)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-tertiary hover:bg-expense/10 hover:text-expense"
                    aria-label={`${t('delete')} ${cat.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
                    {t(cat.name as TranslationKey) as string}
                  </p>
                  <p className="text-xs text-ink-tertiary">
                    {cat.type === 'expense' ? t('expenseType') : t('incomeType')}
                  </p>
                </div>
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: CATEGORY_COLORS[cat.name] || DEFAULT_CATEGORY_COLOR,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
