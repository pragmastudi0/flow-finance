import { AnimatedSegment } from './AnimatedSegment';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { PaymentMethod } from '@/types/models';

/** Where the last choice is remembered, so a run of card expenses is one tap. */
const STORAGE_KEY = 'ff:lastPaymentMethod';

/** The three the add flow offers. Debit and "other" live in the editor. */
const QUICK_METHODS: PaymentMethod[] = ['cash', 'transfer', 'credit'];

/**
 * What the user paid with, read back on the next entry.
 *
 * Reconciliation compares a credit card statement against every expense in
 * the window; without this it offers cash purchases as candidates for card
 * movements, which is the single largest source of wrong suggestions.
 *
 * The storage access is wrapped: a private window or a browser set to block
 * site data throws on read, and an add sheet that cannot open is a far worse
 * failure than a picker that starts on the default.
 */
export function readLastPaymentMethod(): PaymentMethod {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && QUICK_METHODS.includes(stored as PaymentMethod)) return stored as PaymentMethod;
  } catch {
    // storage unavailable — fall through to the default
  }
  return 'credit';
}

export function rememberPaymentMethod(method: PaymentMethod): void {
  try {
    localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // storage unavailable — the picker simply starts on the default next time
  }
}

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}

export function PaymentMethodPicker({ value, onChange }: Props) {
  const { t } = useLanguage();

  return (
    <AnimatedSegment
      options={[
        { value: 'cash' as const, label: t('paymentCash') },
        { value: 'transfer' as const, label: t('paymentTransfer') },
        { value: 'credit' as const, label: t('paymentCredit') },
      ]}
      value={value === 'cash' || value === 'transfer' ? value : 'credit'}
      onChange={onChange}
      ariaLabel={t('paymentMethod')}
    />
  );
}
