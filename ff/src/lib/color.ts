/**
 * Category colours for charts.
 *
 * `CATEGORY_COLORS` is raw, fully saturated hex — fine as an identity, far too
 * loud beside a greyscale UI. Rather than a second hand-tuned map (which could
 * not cover user-created categories, those store arbitrary hex), the hue is
 * kept and saturation and lightness are pinned. Fixing S and L rather than
 * lowering alpha is what makes all the slices read as one family: `#f97316` at
 * 10% alpha looks much heavier than `#3b82f6` at the same alpha.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Muted slice fill: same hue, dialled back so the chart stops shouting. */
export function chartFill(hex: string): string {
  const { h, s } = hexToHsl(hex);
  return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 46))}% 56%)`;
}
