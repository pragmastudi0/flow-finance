import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORY_ICON,
  categoryColor,
  categoryIcon,
  categoryOptions,
  customNamesFor,
  validateCategoryName,
  type CustomCategory,
} from './categoryOptions.ts';
import { CATEGORY_COLORS, CATEGORY_ICONS, DEFAULT_CATEGORY_COLOR } from './categories.ts';

const mascotas: CustomCategory = {
  id: '1',
  name: 'Mascotas',
  icon: '🐕',
  color: '#22c55e',
  type: 'expense',
};

const alquileres: CustomCategory = {
  id: '2',
  name: 'Alquileres',
  icon: '🏠',
  color: '#3b82f6',
  type: 'income',
};

const mine = [mascotas, alquileres];
const label = (v: string) => v;

describe('categoryOptions', () => {
  it('pone las built-in primero y después las del usuario, del tipo pedido', () => {
    const options = categoryOptions('expense', mine, label);

    assert.equal(options[0]?.value, 'food');
    const custom = options.filter((o) => o.custom);
    assert.deepEqual(custom.map((o) => o.value), ['Mascotas']);
    assert.equal(custom[0]?.icon, '🐕');
    assert.equal(custom[0]?.color, '#22c55e');
  });

  it('no mezcla gastos con ingresos', () => {
    const income = categoryOptions('income', mine, label);
    assert.deepEqual(income.filter((o) => o.custom).map((o) => o.value), ['Alquileres']);
  });

  it('usa los defaults cuando la categoría no trae ícono ni color', () => {
    const bare: CustomCategory = { ...mascotas, icon: '', color: '' };
    const [option] = categoryOptions('expense', [bare], label).filter((o) => o.custom);

    assert.equal(option?.icon, DEFAULT_CATEGORY_ICON);
    assert.equal(option?.color, DEFAULT_CATEGORY_COLOR);
  });
});

describe('categoryIcon / categoryColor', () => {
  it('resuelve las built-in por slug', () => {
    assert.equal(categoryIcon('food', mine), CATEGORY_ICONS.food);
    assert.equal(categoryColor('food', mine), CATEGORY_COLORS.food);
  });

  it('resuelve las del usuario por nombre, sin importar tildes ni mayúsculas', () => {
    assert.equal(categoryIcon('MASCOTAS', mine), '🐕');
    assert.equal(categoryColor('mascotas', mine), '#22c55e');
  });

  it('cae al default cuando no conoce la categoría', () => {
    assert.equal(categoryIcon('Viajes', mine), DEFAULT_CATEGORY_ICON);
    assert.equal(categoryColor('Viajes', mine), DEFAULT_CATEGORY_COLOR);
  });
});

describe('validateCategoryName', () => {
  it('rechaza vacío y sólo espacios', () => {
    assert.equal(validateCategoryName('', 'expense', mine), 'empty');
    assert.equal(validateCategoryName('   ', 'expense', mine), 'empty');
  });

  it('rechaza más de 40 caracteres, que es lo que rechaza la base', () => {
    assert.equal(validateCategoryName('x'.repeat(CATEGORY_NAME_MAX), 'expense', mine), null);
    assert.equal(
      validateCategoryName('x'.repeat(CATEGORY_NAME_MAX + 1), 'expense', mine),
      'tooLong',
    );
  });

  it('rechaza un nombre que el usuario ya tiene, ignorando mayúsculas y tildes', () => {
    assert.equal(validateCategoryName('mascotas', 'expense', mine), 'taken');
    assert.equal(validateCategoryName('  MASCOTAS  ', 'expense', mine), 'taken');
  });

  it('permite el mismo nombre del otro lado, igual que el índice único', () => {
    assert.equal(validateCategoryName('Mascotas', 'income', mine), null);
  });

  it('rechaza los nombres reservados de las built-in', () => {
    assert.equal(validateCategoryName('Comida', 'expense', mine, ['food', 'Comida']), 'taken');
  });
});

describe('customNamesFor', () => {
  it('devuelve sólo los nombres del tipo pedido', () => {
    assert.deepEqual(customNamesFor('expense', mine), ['Mascotas']);
    assert.deepEqual(customNamesFor('income', mine), ['Alquileres']);
  });
});
