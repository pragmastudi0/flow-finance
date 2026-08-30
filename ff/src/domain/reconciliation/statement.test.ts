import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkAgainstSubtotal, parseStatementText } from './statement.ts';

/**
 * Lifted verbatim from the real statement the module was built against — the
 * page header and footer, a wrapped descriptor, an instalment row, a row that
 * inherits the date from the line above it, the balance rows that carry an
 * amount and are not movements, and the tax block.
 */
const STATEMENT = `Resumen Visa N° 000643933
Cuenta Nº 1012803201
Cierre
actual
27/08/26
Vencimiento
actual
07/09/26
Tarjetas incluidas en el resumen
Terminada en 3377
Total consumido
$ 984.028,72
Pago anterior y devoluciones
Fecha Descripción Monto en pesos Monto en dólares
10/08/26 Saldo anterior $ 1.016.621,50 -U$S 14,47
04/08/26 Su pago en pesos -$ 1.016.621,50
Saldo del resumen anterior * $ 0,00 -U$S 14,47
Movimientos de Ruiz Gaspa Quintana
Visa crédito terminada en 3377
Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares
07/06/26 Carrefour cba colon 3 de 3 004631 $ 19.130,66
30/07/26 Merpago*homesolution 033137 $ 473.387,50
31/07/26 Facebk *dpxdvym2k2 200321 U$S 9,50
Copia fiel de carácter informativo 2 de 6
Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares
07/08/26 Merpago*municipalidaddeco 817801 $ 2.000,00
Payu*ar*uber 005301 $ 4.990,00
08/08/26 Payu*ar*uber 000057 $ 4.121,00
18/08/26 Qivox colon
787039489654686140
252690 $ 45.990,00
Subtotal de Ruiz Gaspa Quintana $ 549.619,16 U$S 9,50
Impuestos, intereses y percepciones
Fecha Descripción Monto en pesos Monto en dólares
27/08/26 Impuesto de sellos $ $ 16.275,31
Comi.mant.mensual cuenta $ 7.174,38
Total a pagar $ 1.103.854,36 U$S 98,44
Mínimo a pagar $ 162.210,00
Copia fiel de carácter informativo 4 de 6
Términos y condiciones
Abone su resumen en cuotas fijas realizando el pago exacto de la Cuota del plan.
Condiciones vigentes hasta el 7-09-26.`;

test('reconciliation/statement', async (t) => {
  const statement = parseStatementText(STATEMENT);
  const byRef = (ref: string) => statement.movements.find((m) => m.sourceReference === ref);

  await t.test('reads the card and the period from the header', () => {
    assert.equal(statement.cardLast4, '3377');
    assert.equal(statement.closingDate, '2026-08-27');
    assert.equal(statement.dueDate, '2026-09-07');
  });

  await t.test('extracts exactly the movement rows', () => {
    assert.equal(statement.movements.length, 9);
    assert.equal(statement.needsReview.length, 0);
  });

  await t.test('balances, subtotals and totals are not movements', () => {
    // Every one of these lines carries a currency amount.
    const descriptions = statement.movements.map((m) => m.description.toLowerCase());
    for (const excluded of ['saldo anterior', 'su pago', 'subtotal', 'total a pagar', 'mínimo a pagar']) {
      assert.ok(
        !descriptions.some((d) => d.includes(excluded)),
        `"${excluded}" should not be a movement`,
      );
    }
  });

  await t.test('page headers and footers are skipped', () => {
    const raw = statement.movements.map((m) => m.rawLine).join(' ');
    assert.ok(!raw.includes('Copia fiel'));
    assert.ok(!raw.includes('Fecha Descripción'));
  });

  await t.test('parses an Argentine amount and the currency symbol', () => {
    assert.equal(byRef('033137')?.amount, 473387.5);
    assert.equal(byRef('033137')?.currency, 'ARS');
    assert.equal(byRef('200321')?.amount, 9.5);
    assert.equal(byRef('200321')?.currency, 'USD');
  });

  await t.test('reads the instalment counter', () => {
    const installment = byRef('004631');
    assert.equal(installment?.installmentCurrent, 3);
    assert.equal(installment?.installmentTotal, 3);
    assert.equal(installment?.kind, 'installment');
    assert.equal(installment?.description, 'Carrefour cba colon');
  });

  await t.test('a row with no date inherits the day printed above it', () => {
    assert.equal(byRef('817801')?.occurredOn, '2026-08-07');
    assert.equal(byRef('005301')?.occurredOn, '2026-08-07');
    assert.equal(byRef('000057')?.occurredOn, '2026-08-08');
  });

  await t.test('a wrapped descriptor is rejoined before the voucher is read', () => {
    const wrapped = byRef('252690');
    assert.equal(wrapped?.description, 'Qivox colon 787039489654686140');
    assert.equal(wrapped?.amount, 45990);
  });

  await t.test('taxes and fees are classified, not treated as purchases', () => {
    const kinds = Object.fromEntries(statement.movements.map((m) => [m.description, m.kind]));
    assert.equal(kinds['Impuesto de sellos'], 'tax');
    assert.equal(kinds['Comi.mant.mensual cuenta'], 'fee');
    assert.equal(kinds['Merpago*homesolution'], 'purchase');
  });

  await t.test('the legal section after the movements contributes nothing', () => {
    assert.ok(!statement.movements.some((m) => m.description.includes('Abone su resumen')));
  });

  await t.test('the extraction is checked against the statement’s own subtotal', () => {
    const check = checkAgainstSubtotal(statement);
    assert.ok(check);
    assert.equal(check.declared, 549619.16);
    assert.equal(check.extracted, 549619.16);
    assert.equal(check.matches, true);
  });

  await t.test('parsing the same text twice yields the same fingerprints', () => {
    const again = parseStatementText(STATEMENT);
    assert.deepEqual(
      again.movements.map((m) => m.fingerprint),
      statement.movements.map((m) => m.fingerprint),
    );
  });

  await t.test('two charges at one merchant on one day stay distinguishable', () => {
    const twice = parseStatementText(`Movimientos de X
Fecha Descripción Cuota Comprobante Monto en pesos
16/08/26 Payu*ar*uber 004993 $ 5.824,00
16/08/26 Payu*ar*uber 004146 $ 5.824,00`);
    assert.equal(twice.movements.length, 2);
    assert.notEqual(twice.movements[0].fingerprint, twice.movements[1].fingerprint);
  });

  await t.test('a document with no statement structure yields nothing, loudly', () => {
    const empty = parseStatementText('Hola\nEsto no es un resumen\n$ 100,00');
    assert.equal(empty.movements.length, 0);
  });
});
