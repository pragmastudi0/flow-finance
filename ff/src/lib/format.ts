export function formatCurrency(amount: number, currency: string = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** `yyyy-MM-dd` → local noon, so timezones never shift the day. Null when unusable. */
function parseDay(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(dateStr: string): string {
  const date = parseDay(dateStr);
  if (!date) return '';
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatDateFull(dateStr: string): string {
  const date = parseDay(dateStr);
  if (!date) return '';
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}
