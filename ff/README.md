# Flow Finance

Finanzas personales por chat. Escribís `3*15 cafés` o `45320 coto` y la app saca
monto, descripción y categoría sola. También podés sacarle una foto al ticket o
subir una factura PDF y que la lea un modelo de visión.

**Multi-usuario.** Cada usuario tiene sus datos aislados por RLS en Postgres.
En demo mode los datos se guardan en localStorage con namespace por email.

Stack: React + TypeScript + Vite + Tailwind, Supabase (Postgres, Auth, Storage,
Edge Functions).

---

## Demo rápido (sin backend)

```bash
npm install
cp .env.example .env
npm run dev
```

El `.env.example` ya tiene `VITE_DEMO_MODE=true`. La app arranca sin Supabase:
registrás un usuario y los datos se guardan en localStorage aislados por email.

## Producción (con Supabase)

```bash
# 1. Linkear proyecto
supabase link --project-ref tu-proyecto

# 2. Migraciones
supabase db push

# 3. Edge function + secrets
supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=...
supabase functions deploy analyze-receipt

# 4. Build
npm run build     # → dist/, subí a tu hosting
```

Variables de entorno en el hosting:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
# Sin VITE_DEMO_MODE → modo producción real
```

Verificación:

```bash
npm test           # 39 tests
npm run build
```

---

## Lo que incluye

### 7 pantallas

| Ruta | Pantalla |
|---|---|
| `/` | Chat principal con input de texto + botón de cámara |
| `/Reports` | Reportes con charts (pie/bar), filtro semanal/mensual/anual, export XLSX |
| `/Savings` | Metas de ahorro con progreso, aportes |
| `/Settings` | Idioma ES/EN, email, cerrar sesión |
| `/Categories` | Categorías built-in + propias, emoji picker, color picker |
| `/FixedExpenses` | Cuotas y suscripciones |
| `/ExchangeRateConfig` | Configuración de dólar blue automático |

### Análisis de documentos con IA

Subís una foto o PDF desde el chat → edge function la analiza con Gemini →
te muestra el resultado en un sheet (tipo de documento, proveedor/CUIT, total,
ítems, IVA, confianza) → editás si querés → confirmás → se crea la transacción.

Soporta tickets, facturas, remitos y recibos argentinos. La clave de API vive
solo en los secrets de la edge function.

### Parseo de lenguaje natural

El chat acepta entrada libre: `"$20 lunch"`, `"3*15 cafes"`, `"1500 uber"`,
`"50000 salario"`. Usa parser recursivo (sin eval) y categorización por
diccionario de 537 keywords + aprendizaje por usuario.

### Navegación inferior

Home, Reportes, Ahorros, Configuración siempre accesibles desde el NavBar.

---

## Migraciones

```
supabase/migrations/
├── 0001_init.sql         schema base con RLS por usuario
├── 0002_receipts.sql     receipts, AI quota, storage bucket
├── 0003_pdf_support.sql  soporte PDF, columnas de factura
└── 0004_production.sql   índices, trigger on signup, performance
```

---

## Estructura

```
src/
├── domain/           lógica pura, sin React ni red
│   ├── categories.ts     categorías, keywords, colores, íconos
│   ├── parser.ts         texto libre → transacción
│   ├── document.ts       prompt, validación de IA, draft unificado
│   └── *.test.ts
├── components/
│   ├── ui/               button, card, dialog, input, sheet, etc.
│   ├── chat/             ChatBubble, ChatInput, TransactionList
│   ├── analysis/         DocumentAnalysisSheet, UploadZone
│   └── layout/           NavBar (bottom tabs)
├── hooks/             React Query hooks (transactions, categories, etc.)
├── pages/             7 pantallas
├── lib/               supabase, receipts, format, cn, demo, routes
├── i18n/              diccionario ES/EN + provider
└── types/             modelos de dominio
supabase/
├── migrations/        schema
└── functions/
    ├── _shared/           reexporta src/domain
    └── analyze-receipt/   visión con adaptador Gemini/Groq
```

---

## Categorización

537 keywords en 14 categorías, español e inglés, con comercios argentinos.
Match anclado a palabra con acentos normalizados. Aprendizaje por usuario:
cuando corregís una categoría, se guarda y la próxima vez gana sobre el
diccionario.
