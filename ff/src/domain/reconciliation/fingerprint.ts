/**
 * Per-movement identity, so importing the same statement twice is a no-op.
 *
 * A file hash catches the identical PDF; it does not catch the overlap
 * between August's statement and September's, which repeats the instalments
 * still running. The fingerprint below is what the unique index in
 * `flowfinance_bank_transactions` is built on, so the second import silently
 * drops the rows it already has instead of doubling them.
 *
 * FNV-1a rather than SHA-256: this has to stay synchronous (WebCrypto is
 * promise-only) and it only has to be collision-free within one user's
 * statements, not cryptographically strong.
 */
import { normalizeDescription } from './normalize.ts';

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface FingerprintInput {
  occurredOn: string;
  description: string;
  amount: number;
  currency: string;
  direction: string;
  sourceReference?: string | null;
  cardLast4?: string | null;
  installmentCurrent?: number | null;
}

/**
 * Stable key for one movement.
 *
 * Built from the normalized description rather than the raw one so a issuer
 * that reformats its own descriptors between statements does not produce a
 * "new" movement. The instalment number is in the key because instalment 3
 * of 6 and instalment 4 of 6 are genuinely different charges that can share
 * a description, an amount and a voucher number.
 */
export function movementFingerprint(input: FingerprintInput): string {
  const parts = [
    input.cardLast4 ?? '',
    input.occurredOn,
    normalizeDescription(input.description),
    Math.round(input.amount * 100),
    input.currency,
    input.direction,
    input.sourceReference ?? '',
    input.installmentCurrent ?? '',
  ].join('|');

  // Two independent seeds, so a single 32-bit collision is not enough.
  return `${fnv1a(parts)}${fnv1a(`ff:${parts}:ff`)}`;
}
