import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLOR,
  categoriesFor,
  fold,
  type TxType,
} from './categories.ts';

/**
 * The two kinds of category, merged.
 *
 * Built-in categories are slugs (`food`) that double as translation keys; the
 * ones a user creates are free text (`Mascotas`) and are stored in the
 * transaction row exactly as typed. Everything that shows or picks a category
 * has to work with both, which is what this module is for — before it, custom
 * categories only existed on the Categories screen and were invisible to the
 * pickers, the parser and the charts.
 */

export const DEFAULT_CATEGORY_ICON = '💰';

/** Matches the DB check on `flowfinance_categories.name`. */
export const CATEGORY_NAME_MAX = 40;

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TxType;
}

export interface CategoryOption {
  /** What gets written to `flowfinance_transactions.category`. */
  value: string;
  label: string;
  icon: string;
  color: string;
  custom: boolean;
}

function sameName(a: string, b: string): boolean {
  return fold(a.trim()) === fold(b.trim());
}

function findCustom(
  value: string,
  custom: readonly CustomCategory[],
): CustomCategory | undefined {
  return custom.find((c) => sameName(c.name, value));
}

/** Built-in categories for `type`, then the user's own, in creation order. */
export function categoryOptions(
  type: TxType,
  custom: readonly CustomCategory[],
  labelFor: (value: string) => string,
): CategoryOption[] {
  return [
    ...categoriesFor(type).map((value) => ({
      value,
      label: labelFor(value),
      icon: CATEGORY_ICONS[value] ?? DEFAULT_CATEGORY_ICON,
      color: CATEGORY_COLORS[value] ?? DEFAULT_CATEGORY_COLOR,
      custom: false,
    })),
    ...custom
      .filter((c) => c.type === type)
      .map((c) => ({
        value: c.name,
        label: c.name,
        icon: c.icon || DEFAULT_CATEGORY_ICON,
        color: c.color || DEFAULT_CATEGORY_COLOR,
        custom: true,
      })),
  ];
}

/**
 * Icon for a stored category value. Built-in slugs win: a user category named
 * "food" is still their own row, but the slug is what the rest of the app
 * writes, so it has to keep resolving to the built-in.
 */
export function categoryIcon(value: string, custom: readonly CustomCategory[] = []): string {
  return CATEGORY_ICONS[value] ?? findCustom(value, custom)?.icon ?? DEFAULT_CATEGORY_ICON;
}

/** Color for a stored category value, same precedence as `categoryIcon`. */
export function categoryColor(value: string, custom: readonly CustomCategory[] = []): string {
  return CATEGORY_COLORS[value] ?? findCustom(value, custom)?.color ?? DEFAULT_CATEGORY_COLOR;
}

export type NameProblem = 'empty' | 'tooLong' | 'taken';

/**
 * Everything the DB would reject, plus one thing it can't see: the unique index
 * only covers a user's own rows, so nothing stopped a second "Comida" next to
 * the built-in one. `reserved` carries the built-in names to check against.
 */
export function validateCategoryName(
  name: string,
  type: TxType,
  custom: readonly CustomCategory[],
  reserved: readonly string[] = [],
): NameProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > CATEGORY_NAME_MAX) return 'tooLong';
  if (reserved.some((r) => sameName(r, trimmed))) return 'taken';
  if (custom.some((c) => c.type === type && sameName(c.name, trimmed))) return 'taken';
  return null;
}

/** Custom category names for one side — the parser matches entries against these. */
export function customNamesFor(
  type: TxType,
  custom: readonly CustomCategory[],
): string[] {
  return custom.filter((c) => c.type === type).map((c) => c.name);
}
