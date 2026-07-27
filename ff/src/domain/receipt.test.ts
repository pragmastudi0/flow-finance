import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  categorizationText,
  parseReceiptResponse,
  toTransactionDraft,
  type ReceiptExtraction,
} from './receipt.ts';

const TODAY = new Date(2026, 6, 23); // 2026-07-23

const parse = (raw: string) => parseReceiptResponse(raw, { today: TODAY });

const json = (o: unknown) => JSON.stringify(o);

const valid = {
  merchant: 'COTO CICSA',
  total: 45320.5,
  currency: 'ARS',
  date: '2026-07-20',
  items: [{ description: 'Leche entera 1L', quantity: 2, amount: 2400 }],
  confidence: 0.93,
};

// ─── response validation ─────────────────────────────────────────────────────

test('parses a well-formed response', () => {
  const r = parse(json(valid));
  assert.equal(r?.merchant, 'COTO CICSA');
  assert.equal(r?.total, 45320.5);
  assert.equal(r?.currency, 'ARS');
  assert.equal(r?.date, '2026-07-20');
  assert.equal(r?.items.length, 1);
  assert.equal(r?.confidence, 0.93);
});

test('survives markdown fences and surrounding prose', () => {
  assert.equal(parse('```json\n' + json(valid) + '\n```')?.total, 45320.5);
  assert.equal(parse('Claro, acá va:\n' + json(valid) + '\nEspero que sirva')?.total, 45320.5);
});

test('accepts a total written the Argentine way', () => {
  assert.equal(parse(json({ ...valid, total: '1.234,56' }))?.total, 1234.56);
  assert.equal(parse(json({ ...valid, total: '$ 45.320,50' }))?.total, 45320.5);
});

test('rejects responses with no usable total', () => {
  assert.equal(parse(json({ ...valid, total: 0 })), null, 'not a receipt');
  assert.equal(parse(json({ ...valid, total: -50 })), null);
  assert.equal(parse(json({ ...valid, total: 'no se lee' })), null);
  assert.equal(parse(json({ ...valid, confidence: 0 })), null);
});

test('rejects malformed output instead of throwing', () => {
  assert.equal(parse(''), null);
  assert.equal(parse('lo siento, no puedo leer la imagen'), null);
  assert.equal(parse('{ total: '), null);
});

test('drops impossible dates rather than trusting them', () => {
  assert.equal(parse(json({ ...valid, date: '2026-02-31' }))?.date, null, 'day out of range');
  assert.equal(parse(json({ ...valid, date: '2027-01-01' }))?.date, null, 'in the future');
  assert.equal(parse(json({ ...valid, date: '2019-05-05' }))?.date, null, 'implausibly old');
  assert.equal(parse(json({ ...valid, date: '20/07/2026' }))?.date, null, 'wrong format');
  assert.equal(parse(json({ ...valid, date: null }))?.date, null);
});

test('clamps confidence into range', () => {
  assert.equal(parse(json({ ...valid, confidence: 5 }))?.confidence, 1);
  assert.equal(parse(json({ ...valid, confidence: -2 })), null, 'negative means unusable');
  assert.equal(parse(json({ ...valid, confidence: 'alta' }))?.confidence, 0.5);
});

test('discards junk line items without discarding the receipt', () => {
  const r = parse(json({
    ...valid,
    items: [
      { description: 'Pan lactal', amount: 1800 },
      { description: '   ' },
      'no soy un objeto',
      null,
    ],
  }));
  assert.equal(r?.items.length, 1);
  assert.equal(r?.items[0].description, 'Pan lactal');
  assert.equal(r?.items[0].quantity, null);
});

test('defaults an unknown currency to ARS', () => {
  assert.equal(parse(json({ ...valid, currency: 'pesos' }))?.currency, 'ARS');
  assert.equal(parse(json({ ...valid, currency: 'usd' }))?.currency, 'USD');
});

// ─── draft mapping ───────────────────────────────────────────────────────────

const extraction = (over: Partial<ReceiptExtraction> = {}): ReceiptExtraction => ({
  merchant: 'COTO CICSA',
  total: 45320.5,
  currency: 'ARS',
  date: '2026-07-20',
  items: [],
  confidence: 0.93,
  ...over,
});

test('maps an extraction to a saveable draft', () => {
  const d = toTransactionDraft(extraction(), { today: TODAY });
  assert.equal(d?.amount, 45320.5);
  assert.equal(d?.type, 'expense');
  assert.equal(d?.category, 'groceries');
  assert.equal(d?.description, 'COTO CICSA');
  assert.equal(d?.occurredOn, '2026-07-20');
  assert.equal(d?.needsReview, false);
});

test('flags low-confidence receipts for review', () => {
  assert.equal(toTransactionDraft(extraction({ confidence: 0.4 }))?.needsReview, true);
});

test('falls back to today when the receipt date is unreadable', () => {
  const d = toTransactionDraft(extraction({ date: null }), { today: TODAY });
  assert.equal(d?.occurredOn, '2026-07-23');
});

test('refuses a USD receipt with no exchange rate', () => {
  assert.equal(toTransactionDraft(extraction({ currency: 'USD' }), { usdRate: null }), null);
  assert.equal(
    toTransactionDraft(extraction({ currency: 'USD' }), { usdRate: 1300 })?.fxRate,
    1300,
  );
});

test('learnings override the merchant guess', () => {
  const d = toTransactionDraft(extraction(), {
    learnings: [{ keyword: 'coto', category: 'shopping' }],
  });
  assert.equal(d?.category, 'shopping');
});

test('uses line items when the merchant is unknown', () => {
  const d = toTransactionDraft(
    extraction({
      merchant: null,
      items: [
        { description: 'Ibuprofeno 400mg', quantity: 1, amount: 3200 },
        { description: 'Protector solar', quantity: 1, amount: 12000 },
      ],
    }),
  );
  assert.equal(d?.category, 'health');
  assert.equal(d?.description, 'Ticket');
});

test('categorization text puts the merchant first', () => {
  const text = categorizationText(
    extraction({ merchant: 'YPF', items: [{ description: 'Nafta super', quantity: 1, amount: 50000 }] }),
  );
  assert.ok(text.startsWith('YPF'));
});

// ─── merchant categorization ─────────────────────────────────────────────────

test('recognizes common Argentine merchants', () => {
  const cases: Array<[string, string]> = [
    ['COTO CICSA', 'groceries'],
    ['CARREFOUR EXPRESS', 'groceries'],
    ['DIA ARGENTINA', 'groceries'],
    ['YPF SERVICIOS', 'transport'],
    ['SHELL C.A.P.S.A.', 'transport'],
    ['UBER TRIP', 'transport'],
    ['FARMACITY S.A.', 'health'],
    ['MERCADOLIBRE SRL', 'shopping'],
    ['NETFLIX.COM', 'entertainment'],
    ['EDENOR SA', 'bills'],
    ['METROGAS', 'bills'],
    ['MCDONALDS', 'food'],
    ['RAPPI ARG', 'food'],
    ['CINEMARK PALERMO', 'entertainment'],
  ];
  for (const [merchant, expected] of cases) {
    const d = toTransactionDraft(extraction({ merchant }));
    assert.equal(d?.category, expected, `${merchant} → ${d?.category}, esperaba ${expected}`);
  }
});
