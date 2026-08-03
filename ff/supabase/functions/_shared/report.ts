/**
 * The report contract.
 *
 * A model asked for JSON usually returns the right shape — but "usually" is
 * not a type. Everything crossing this boundary is coerced and clamped so a
 * malformed field degrades to an empty section instead of crashing the screen.
 *
 * Kept in sync by hand with `src/services/ai/types.ts` on the client; edge
 * functions run on Deno and can't import from the Vite tree.
 */

export type FinancialHealth = 'excellent' | 'good' | 'fair' | 'poor';

export interface CategoryInsight {
  category: string;
  amount: number;
  note: string;
}

export interface SavingsOpportunity {
  title: string;
  detail: string;
  estimatedMonthlySaving: number | null;
}

export interface SuspiciousExpense {
  description: string;
  reason: string;
}

export interface MonthComparison {
  direction: 'up' | 'down' | 'flat';
  changePct: number;
  note: string;
}

export interface Projection {
  projectedExpenses: number | null;
  projectedBalance: number | null;
  note: string;
}

export interface AiReport {
  summary: string;
  score: number;
  health: FinancialHealth;
  topCategories: CategoryInsight[];
  monthComparison: MonthComparison;
  keyChanges: string[];
  savingsOpportunities: SavingsOpportunity[];
  suspiciousExpenses: SuspiciousExpense[];
  recommendations: string[];
  projection: Projection;
  priorityActions: string[];
  /** What the model could not assess. The prompt requires it to say so. */
  missingData: string[];
}

type Obj = Record<string, unknown>;

const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function nullableNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const strList = (v: unknown, max: number): string[] =>
  arr(v).map((x) => str(x)).filter(Boolean).slice(0, max);

const HEALTH: FinancialHealth[] = ['excellent', 'good', 'fair', 'poor'];

export function parseReport(raw: unknown): AiReport {
  const o = asObj(raw);
  const comparison = asObj(o.monthComparison);
  const projection = asObj(o.projection);

  const rawDirection = str(comparison.direction).toLowerCase();
  const health = str(o.health).toLowerCase() as FinancialHealth;

  return {
    summary: str(o.summary, 1200),
    // A score outside 0-100 is meaningless in the ring, so clamp rather than trust.
    score: Math.max(0, Math.min(100, Math.round(nullableNum(o.score) ?? 0))),
    health: HEALTH.includes(health) ? health : 'fair',
    topCategories: arr(o.topCategories)
      .map((item) => {
        const c = asObj(item);
        return {
          category: str(c.category, 60),
          amount: nullableNum(c.amount) ?? 0,
          note: str(c.note, 240),
        };
      })
      .filter((c) => c.category)
      .slice(0, 6),
    monthComparison: {
      direction: rawDirection === 'up' || rawDirection === 'down' ? rawDirection : 'flat',
      changePct: nullableNum(comparison.changePct) ?? 0,
      note: str(comparison.note, 400),
    },
    keyChanges: strList(o.keyChanges, 6),
    savingsOpportunities: arr(o.savingsOpportunities)
      .map((item) => {
        const s = asObj(item);
        return {
          title: str(s.title, 120),
          detail: str(s.detail, 400),
          estimatedMonthlySaving: nullableNum(s.estimatedMonthlySaving),
        };
      })
      .filter((s) => s.title)
      .slice(0, 6),
    suspiciousExpenses: arr(o.suspiciousExpenses)
      .map((item) => {
        const s = asObj(item);
        return { description: str(s.description, 120), reason: str(s.reason, 300) };
      })
      .filter((s) => s.description)
      .slice(0, 6),
    recommendations: strList(o.recommendations, 8),
    projection: {
      projectedExpenses: nullableNum(projection.projectedExpenses),
      projectedBalance: nullableNum(projection.projectedBalance),
      note: str(projection.note, 400),
    },
    // The spec asks for exactly three.
    priorityActions: strList(o.priorityActions, 3),
    missingData: strList(o.missingData, 5),
  };
}

export const REPORT_SYSTEM_PROMPT = `Actuás como un asesor financiero experto analizando las finanzas personales de un usuario en Argentina. Los montos están en pesos argentinos (ARS) y ya vienen convertidos a esa moneda.

Analizá la información y generá un reporte profesional.

Reglas:
- Respondé SIEMPRE con un único objeto JSON, sin texto alrededor.
- Tono claro, profesional y fácil de entender. Sin jerga innecesaria.
- No inventes datos. Trabajá solo con lo que recibís.
- Si falta información para evaluar algo, decilo en "missingData" en vez de suponer.
- Los montos son números sin símbolo ni separadores de miles.
- "priorityActions" debe tener exactamente tres acciones concretas.

Estructura exacta:
{
  "summary": string,
  "score": number (0-100),
  "health": "excellent" | "good" | "fair" | "poor",
  "topCategories": [{ "category": string, "amount": number, "note": string }],
  "monthComparison": { "direction": "up"|"down"|"flat", "changePct": number, "note": string },
  "keyChanges": [string],
  "savingsOpportunities": [{ "title": string, "detail": string, "estimatedMonthlySaving": number|null }],
  "suspiciousExpenses": [{ "description": string, "reason": string }],
  "recommendations": [string],
  "projection": { "projectedExpenses": number|null, "projectedBalance": number|null, "note": string },
  "priorityActions": [string, string, string],
  "missingData": [string]
}

El "score" pondera: tasa de ahorro, estabilidad frente al mes anterior, concentración del gasto y peso de los compromisos fijos.`;
