import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryChart } from './CategoryChart';

vi.mock('@/i18n/LanguageProvider', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
  useCategoryLabel: () => (category: string) => category,
}));

vi.mock('@/hooks/useCategoryOptions', () => ({
  useCategoryVisuals: () => ({
    colorOf: () => '#777',
    iconOf: () => '•',
  }),
}));

describe('CategoryChart interaction', () => {
  it('opens a category through the touch friendly category list', async () => {
    const user = userEvent.setup();
    const onCategorySelect = vi.fn();

    render(
      <CategoryChart
        view="pie"
        onViewChange={vi.fn()}
        byCategory={[{ name: 'shopping', value: 1500 }]}
        overTime={[]}
        title="Expenses"
        emptyText="No expenses"
        onCategorySelect={onCategorySelect}
      />,
    );

    await user.click(screen.getByRole('button', { name: /shopping/i }));
    expect(onCategorySelect).toHaveBeenCalledWith('shopping');
  });
});
