import { useMemo } from 'react';

import { useUserCategories } from './useCategories.ts';
import { useCategoryLabel } from '@/i18n/LanguageProvider.tsx';
import { dictionary, LANGUAGES, type TranslationKey } from '@/i18n/dictionary.ts';
import { categoriesFor, type TxType } from '@/domain/categories.ts';
import {
  categoryColor,
  categoryIcon,
  categoryOptions,
  customNamesFor,
  type CategoryOption,
} from '@/domain/categoryOptions.ts';

/**
 * Built-in categories plus the ones this user created, ready for a picker.
 * Every surface that offers a choice of category reads this, so a category
 * someone creates is usable everywhere and not just on its own screen.
 */
export function useCategoryOptions(type: TxType): {
  options: CategoryOption[];
  isLoading: boolean;
} {
  const { data: custom = [], isLoading } = useUserCategories();
  const labelFor = useCategoryLabel();

  const options = useMemo(
    () => categoryOptions(type, custom, labelFor),
    // `labelFor` is rebuilt on every render; the language behind it is what
    // actually changes the labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, custom, labelFor],
  );

  return { options, isLoading };
}

/** Icon and color for a stored category value, custom ones included. */
export function useCategoryVisuals(): {
  iconOf: (value: string) => string;
  colorOf: (value: string) => string;
} {
  const { data: custom = [] } = useUserCategories();

  return useMemo(
    () => ({
      iconOf: (value: string) => categoryIcon(value, custom),
      colorOf: (value: string) => categoryColor(value, custom),
    }),
    [custom],
  );
}

/** The user's own category names for one side, for the parser to match on. */
export function useCustomCategoryNames(type: TxType): string[] {
  const { data: custom = [] } = useUserCategories();
  return useMemo(() => customNamesFor(type, custom), [type, custom]);
}

/**
 * Names a new category cannot take: every built-in slug and its label in both
 * languages, so "Comida" stays blocked even for someone using the app in
 * English (and the block survives switching language later).
 */
export function useReservedCategoryNames(type: TxType): string[] {
  return useMemo(() => {
    const names: string[] = [];
    for (const slug of categoriesFor(type)) {
      names.push(slug);
      for (const lang of LANGUAGES) {
        const label = dictionary[lang][slug as TranslationKey];
        if (typeof label === 'string') names.push(label);
      }
    }
    return names;
  }, [type]);
}
