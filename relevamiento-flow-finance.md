# Relevamiento técnico — Flow Finance (`flow-finance-bygaspar.base44.app`)

> **Objetivo:** documentar la app con suficiente detalle como para reconstruirla desde cero en un repositorio nuevo.

---

## 0. Método y límites del relevamiento

La app es una SPA de **Base44** y está **detrás de login** (`/api/apps/public/.../public-settings` responde `auth_required`). No pude usar la UI ni leer datos reales.

Lo que sí hice: descargar y desminificar el bundle de producción y reconstruir el código de aplicación a partir de ahí.

| Recurso | Tamaño | Qué aportó |
|---|---|---|
| `/assets/index-Bd5QZDTc.js` | 1.42 MB | Todo el código de la app (páginas, lógica, i18n, llamadas a entidades) |
| `/assets/index-ChqcRgUl.css` | 72 KB | Tailwind v3 compilado + variables de shadcn/ui |
| `/` (HTML) | 3.4 KB | Meta tags, PWA, snapshot SEO con el listado de páginas |

**Lo que esto significa para vos:**

- ✅ **Confiable al 100 %:** rutas, jerarquía de componentes, lógica de negocio, textos, colores, íconos, queries y mutaciones, nombres de entidades y de campos.
- ⚠️ **Inferido (no autoritativo):** los **tipos y constraints** de cada campo. El bundle muestra qué se escribe y qué se lee, no el JSON Schema real. Los tipos de la sección 4 son mi mejor lectura del uso.
- ❌ **No accesible:** el código del backend function `fetchUsdBlue`, las reglas de permisos por fila (RLS) de Base44, los datos, y si existe un cron programado.

> **Recomendación previa a codificar:** exportá los schemas reales desde el panel de Base44 (Data → cada entidad → schema JSON) y el código de `fetchUsdBlue`. Con eso la sección 4 pasa de "inferido" a "cierto" y te ahorrás una migración de datos rota. Si no tenés acceso al panel, avisame y ajustamos el plan.

---

## 1. Qué es la app

Tracker de finanzas personales, **mobile-first**, cuya interacción central es un **chat**: escribís `"3*15 cafés"` o `"$20 almuerzo"` en lenguaje natural y la app parsea monto, descripción y categoría sin llamar a ningún LLM (todo es regex + diccionario de keywords + aprendizaje local).

Alrededor de eso hay: reportes con gráficos y export a Excel, categorías personalizables, gastos fijos en cuotas, objetivos de ahorro y una integración con el dólar blue argentino.

**Idiomas:** español (default) e inglés, togglable, persistido en `localStorage`.

---

## 2. Stack detectado

| Capa | Tecnología | Notas |
|---|---|---|
| Build | **Vite** | `vite:preloadError`, imports dinámicos con `modulepreload` |
| UI | **React 18** + **react-router-dom** | Router client-side, sin SSR |
| Estado servidor | **@tanstack/react-query** | `useQuery` / `useMutation` / `invalidateQueries` |
| Estilos | **Tailwind CSS v3** | Config default de shadcn (`--radius: .5rem`, tema neutral) |
| Componentes | **shadcn/ui** sobre **Radix UI** | Dialog, Select, Popover, Checkbox, Card, Button, Input, Textarea |
| Utilidad CSS | `cn()` = **tailwind-merge** + **clsx** | |
| Animación | **framer-motion** | `motion.div`, `AnimatePresence` en casi todas las páginas |
| Íconos | **lucide-react** | |
| Gráficos | **recharts** | Pie, Bar horizontal, Area |
| Fechas | **date-fns** | `format`, `parseISO`, `startOfWeek`, `differenceInDays`, `addMonths`… |
| Excel | **SheetJS (xlsx)** `0.18.5` | Export de 4 hojas |
| Toasts | **sonner** | |
| Backend | **@base44/sdk** | Entidades, auth, functions, realtime (socket.io) |

**App ID de Base44:** `6938b9506ca37c3a232cfbb6` · **Server:** `https://base44.app`

Fuente tipográfica: la del sistema (`ui-sans-serif, system-ui`). No hay webfont custom.

---

## 3. Rutas y navegación

El `Layout` es prácticamente vacío: solo envuelve todo en el `LanguageProvider`. **No hay barra de navegación global** — la navegación se hace con links puntuales entre páginas.

```
/                     → Home (mainPage, mismo componente que /Home)
/Home                 → chat de gastos/ingresos
/Reports              → reportes y gráficos
/Savings              → objetivos de ahorro
/Settings             → índice de configuración
/Categories           → ABM de categorías
/FixedExpenses        → cuotas y suscripciones
/ExchangeRateConfig   → dólar blue
*                     → 404
```

Helper de URLs: `createPageUrl(name) => "/" + name.replace(/ /g, "-")`

**Grafo de navegación real:**

```
Home ──┬── Settings ──┬── Categories
       │              ├── (toggle de idioma, inline)
       │              └── ExchangeRateConfig
       ├── FixedExpenses
       └── Reports ─── Savings
```

⚠️ **`/Savings` solo es alcanzable desde `/Reports`.** No aparece en Settings ni en Home. Si es intencional, replicalo; si no, es lo primero que arreglaría.

---

## 4. Modelo de datos

8 entidades propias + el `User` de Base44. **Todas las entidades tienen implícitos** `id`, `created_date`, `updated_date`, `created_by` (email del dueño) — los provee Base44.

> Los tipos de abajo están **inferidos del uso**. Verificalos contra los schemas reales.

### `Transaction` — núcleo de la app

| Campo | Tipo inferido | Notas |
|---|---|---|
| `amount` | number | Siempre positivo; el signo lo da `type` |
| `type` | `"expense" \| "income"` | |
| `category` | string | Slug default (`food`, `salary`…) **o** nombre libre de una categoría custom |
| `description` | string | |
| `date` | string `YYYY-MM-DD` | Fecha local del cliente, no UTC |
| `raw_input` | string | El texto crudo que escribió el usuario. Los gastos fijos guardan `"Fixed: {descripción}"` |
| `calculation` | string \| undefined | Solo si usó una expresión matemática. Ej: `"3*15"` |

**No tiene campo `currency`.** Ver hallazgo H-3.

### `Category` — categorías custom del usuario

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | Texto libre. Es lo que se guarda en `Transaction.category` |
| `icon` | string (emoji) | Default `"📝"` |
| `color` | string | Nombre de color Tailwind. La UI ofrece 11; el renderer mapea 22 |
| `type` | `"expense" \| "income"` | |

Las categorías **default no viven en la base**: están hardcodeadas en el front y se mezclan con las custom en runtime.

### `CategoryLearning` — auto-aprendizaje de categorías

| Campo | Tipo | Notas |
|---|---|---|
| `keyword` | string | La descripción en minúsculas |
| `category` | string | La categoría que el usuario eligió al corregir |
| `type` | `"expense" \| "income"` | |

Se crea/actualiza cuando el usuario **edita la categoría** de una transacción. En futuros parseos, tiene prioridad sobre el diccionario de keywords.

⚠️ **Se consulta sin filtrar por `created_by`** → ver hallazgo H-1.

### `FixedExpense` — cuotas y suscripciones

| Campo | Tipo | Notas |
|---|---|---|
| `description` | string | |
| `amount` | number | Monto **mensual** |
| `currency` | `"ARS" \| "USD"` | |
| `category` | string | Select acotado: `bills`, `shopping`, `education`, `transport`, `other` |
| `recurrenceType` | `"installments" \| "subscription"` | |
| `startDate` | string `YYYY-MM-DD` | |
| `installments` | number \| undefined | Solo si `recurrenceType === "installments"` |
| `remainingInstallments` | number \| undefined | Se calcula al crear y decrece al registrar |
| `status` | `"active" \| "cancelled" \| "completed"` | |
| `cancellationDate` | string \| undefined | Se setea solo en una de las dos acciones de cancelar |

### `SavingsGoal` — objetivos de ahorro

| Campo | Tipo | Notas |
|---|---|---|
| `description` | string | |
| `goalAmount` | number | Acepta expresión matemática en el input, se evalúa antes de guardar |
| `targetDate` | string `YYYY-MM-DD` | |
| `currentSavedAmount` | number | Default 0 |
| `status` | `"active" \| …` | La query filtra `status: "active"`; no vi dónde cambia |

### `SavingsContribution` — aportes

| Campo | Tipo |
|---|---|
| `goalId` | string (FK → SavingsGoal.id) |
| `amount` | number |

⚠️ **Se lee pero nunca se escribe** → ver hallazgo H-2.

### `ExchangeRateConfig` — config del dólar blue (1 por usuario)

| Campo | Tipo | Notas |
|---|---|---|
| `source_url` | string | Default `https://api.bluelytics.com.ar/v2/latest` |
| `refresh_minutes` | number | Default 60, UI limita 15–1440 |
| `last_value` | number \| null | Cotización vigente. **Lo usa el parser para convertir USD → ARS** |
| `last_updated_at` | datetime \| null | |
| `last_status` | `"ok" \| "error" \| "pending"` | |
| `last_error` | string \| null | |

Se crea on-demand con defaults la primera vez que el usuario entra a la página.

### `ExchangeRateHistory` — bitácora de actualizaciones

| Campo | Tipo | Notas |
|---|---|---|
| `datetime` | datetime | Se ordena por `-datetime`, se muestran los últimos 10 |
| `status` | `"ok" \| "error"` | |
| `rate_sell` | number \| null | El valor que se muestra |
| `error_message` | string \| null | |

Probablemente también exista `rate_buy` (la API de bluelytics lo devuelve), pero el front no lo usa.

### Diagrama de relaciones

```
User (Base44)
 └── created_by ─┬── Transaction
                 ├── Category
                 ├── FixedExpense ──(al registrar)──▶ Transaction (bulkCreate)
                 ├── SavingsGoal ◀──goalId── SavingsContribution
                 ├── ExchangeRateConfig ──▶ ExchangeRateHistory
                 └── CategoryLearning  ⚠️ sin filtro de owner
```

---

## 5. Funcionalidad, página por página

### 5.1 `/Home` — el chat

Layout mobile: `max-w-lg`, `h-screen`, columna flex. Header + tabs + área scrollable + input fijo abajo.

- **Header:** título/subtítulo i18n, e íconos a Settings, FixedExpenses y Reports.
- **Tabs:** Gastos (rose) / Ingresos (emerald), con transición horizontal de framer-motion.
- **Tarjeta resumen:** total del **mes en curso** + cantidad de registros.
- **Historial:** las transacciones del mes renderizadas como burbujas de chat, ordenadas por `created_date` ascendente, precedidas por un mensaje de bienvenida.
- **Input:** placeholder rotativo cada 3 s entre 4 ejemplos.
- **Cada burbuja:** emoji + chip de categoría coloreado + monto con signo. Hover → editar / borrar.
- **Edición inline:** monto, descripción, categoría (select con defaults + custom) y fecha. Si cambia la categoría, se persiste el aprendizaje en `CategoryLearning`.

**Query:** `Transaction.filter({created_by}, "-created_date", 500)` — tope duro de 500.

### 5.2 `/Reports`

- **Selector de período:** Semana / Mes / Año / Todo, con flechas prev-next y label formateado.
- **4 tarjetas:** Ingresos, Gastos, Balance, Tasa de ahorro. Colores condicionales (la tasa es emerald ≥20 %, amber ≥0, rose si negativa).
- **Gráficos** (recharts, alto fijo 288 px):
  - **Torta:** donut, `innerRadius 60 / outerRadius 100`, colores por categoría.
  - **Barras:** horizontal, top 8 categorías. **Click en la barra abre el modal de detalle.**
  - **Tendencia:** AreaChart con dos series (ingresos `#10b981`, gastos `#f43f5e`) y gradientes verticales. Granularidad: día para semana/mes, mes para año.
- **Export a Excel** (SheetJS), 4 hojas: *Resumen Financiero*, *Transacciones*, *Gastos por Categoría*, *Ingresos por Categoría*. Nombre: `reporte-financiero-DD-MM-YYYY.xlsx`.
- **Desglose por categoría:** barras de progreso animadas, con toggle gasto/ingreso.
- **Modal de detalle:** lista las transacciones de esa categoría y permite **recategorizarlas una por una**.

**Query:** `Transaction.filter({created_by}, "-date", 500)`.

### 5.3 `/Savings`

CRUD de objetivos + tarjetas con:
- Barra de progreso animada y porcentaje.
- **Ahorro diario necesario** = `(goalAmount − currentSavedAmount) / díasRestantes`
- **Ahorro mensual necesario** = `(goalAmount − currentSavedAmount) / (díasRestantes / 30)`
- **Estimación:** promedio de los últimos 3 aportes vs. lo que falta → `"✅ En camino"` o `"⚠️ Requiere más ahorro"`.
- Diálogo Agregar/Restar que actualiza `currentSavedAmount`.
- El campo de monto objetivo acepta expresiones (`5000+5000`).

### 5.4 `/FixedExpenses`

- Alta con: descripción, monto mensual, moneda (ARS/USD), categoría, tipo (cuotas/suscripción), fecha de inicio y cantidad de cuotas.
- **Al crear con fecha pasada, descuenta las cuotas ya transcurridas** (`differenceInMonths(hoy, startDate)`).
- Tarjetas con progreso `X / N cuotas` y fecha de fin (`startDate + (installments − 1)` meses), o "Hasta cancelar" para suscripciones.
- **"Registrar Gastos del Mes":** modal con checkboxes (todos tildados por defecto) → `Transaction.bulkCreate()` con fecha de hoy y `raw_input: "Fixed: …"`, y decrementa `remainingInstallments`; al llegar a 0 pasa a `completed`.

### 5.5 `/Categories`

Lista mezclada de defaults (badge "Categoría predeterminada", no editables) + custom (editar/borrar). Alta con nombre, emoji (picker de 66 emojis en popover) y color (11 opciones). Toggle gasto/ingreso.

⚠️ Esta página está **hardcodeada en español**, no usa i18n para sus labels propios.

### 5.6 `/Settings`

Índice de 3 tarjetas: Categorías (link), Idioma (toggle inline), Dólar Blue (link).

### 5.7 `/ExchangeRateConfig`

Cotización actual con badge de estado, botón "Actualizar Ahora" (invoca la backend function), form de URL fuente + minutos de refresco, e historial de las últimas 10 lecturas.

---

## 6. Lógica de negocio clave

### 6.1 El parser de lenguaje natural

Esto es el corazón de la app. **No usa IA.** Algoritmo:

1. Detectar `usd` en el texto (case-insensitive) y removerlo.
2. **Rama A — expresión matemática:** si el texto *empieza* con `[\d.+\-*/()\s×x]+`:
   - Normaliza `×` y `x` → `*`.
   - Valida contra `/^[\d.+\-*/()]+$/` y evalúa con `Function('"use strict"; return (…)')()`.
   - Si el resultado es finito y > 0: el resto del string es la descripción y la expresión se guarda en `calculation`.
3. **Rama B — extracción de monto:** prueba 5 regex en orden: `$123` → `123$` → `123 ` al inicio → ` 123` al final → cualquier número.
   - Normaliza separadores decimales con heurística ES/EN (maneja `1.234,56` y `1,234.56`).
4. **Si había `usd`:** multiplica el monto por `ExchangeRateConfig.last_value`.
5. **Categorización, en orden de prioridad:**
   1. `CategoryLearning`: si alguna `keyword` aparece en el texto → esa categoría.
   2. Diccionario de keywords: cuenta coincidencias por categoría, gana la de mayor score.
   3. Fallback: `"other"` para gastos, `"other_income"` para ingresos.
6. Descripción = el texto con los números removidos. Si queda vacía, usa el nombre de la categoría.
7. Fecha = hoy (local).
8. Si el monto resultante es ≤ 0, devuelve mensaje de error sin crear nada.

### 6.2 Diccionario de keywords (categorización)

**Solo en inglés.** Escribir "almuerzo" cae en `other`. Ver hallazgo H-4.

```js
const CATEGORY_KEYWORDS = {
  food:          ["lunch","dinner","breakfast","meal","food","eat","restaurant","cafe","coffee","snack","pizza","burger","sushi","salad","sandwich"],
  groceries:     ["grocery","groceries","supermarket","market","vegetables","fruits","meat","milk","bread","eggs"],
  transport:     ["taxi","uber","lyft","cab","bus","metro","subway","train","gas","fuel","petrol","parking","toll","fare"],
  shopping:      ["clothes","clothing","shoes","shirt","pants","dress","jacket","amazon","online","mall","store","shop"],
  entertainment: ["movie","cinema","netflix","spotify","concert","show","game","gaming","subscription","streaming"],
  health:        ["doctor","medicine","pharmacy","hospital","clinic","dental","gym","fitness","health","medical"],
  bills:         ["electric","electricity","water","internet","phone","mobile","bill","utility","rent","insurance"],
  education:     ["book","books","course","class","tuition","school","college","university","learning","training"],
  // ingresos
  salary:        ["salary","paycheck","wage","wages","pay"],
  freelance:     ["freelance","client","project","consulting","gig"],
  investment:    ["dividend","interest","stock","investment","return","profit"],
  gift:          ["gift","present","bonus","reward"],
  refund:        ["refund","reimbursement","cashback","return"],
  other_income:  ["sold","selling","income","received","payment"],
};
```

Categorías de **ingreso**: `salary`, `freelance`, `investment`, `gift`, `refund`, `other_income`.
Categorías de **gasto**: todas las demás + `other`.

### 6.3 Colores e íconos de categorías

```js
const CATEGORY_COLORS = {
  food:"#f97316", groceries:"#84cc16", transport:"#3b82f6", shopping:"#ec4899",
  entertainment:"#8b5cf6", health:"#14b8a6", bills:"#f59e0b", education:"#6366f1",
  other:"#64748b", salary:"#10b981", freelance:"#06b6d4", investment:"#8b5cf6",
  gift:"#f472b6", refund:"#22c55e", other_income:"#6b7280",
};

const CATEGORY_ICONS = {
  food:"🍽️", groceries:"🛒", transport:"🚕", shopping:"🛍️", entertainment:"🎬",
  health:"💊", bills:"📄", education:"📚", other:"💰", salary:"💵",
  freelance:"💼", investment:"📈", gift:"🎁", refund:"↩️", other_income:"💰",
};
```

**Paleta del picker de categorías (11):** `red, rose, orange, yellow, green, emerald, blue, indigo, purple, pink, slate`
**Emojis del picker (66):** 💰 💵 💳 🏦 💸 🤑 🍽️ 🍕 🍔 🍜 ☕ 🍺 🛒 🛍️ 👕 👟 🎁 📦 🚕 🚗 🚌 ✈️ ⛽ 🚇 🏠 💡 📱 💻 🔌 📺 🎬 🎮 🎵 🎸 ⚽ 🏋️ 💊 🏥 🩺 💉 🧘 💪 📚 ✏️ 🎓 📖 🖊️ 📝 💼 🏢 📊 📈 💹 🎯 🎨 🖼️ 🌟 ⭐ ❤️ 🔥 📄 🧾 💡 🔧 🛠️ ⚙️

---

## 7. Internacionalización

`LanguageProvider` con contexto React, default `"es"`, persistido en `localStorage.language`, sin librería externa. El diccionario completo está en el bundle y lo tengo extraído — son ~50 claves × 2 idiomas.

Claves: `appTitle, appSubtitle, reports, expenses, income, expenseWelcome, incomeWelcome, totalSpent, totalEarned, thisMonth, entry, entries, couldNotDetect, delete, confirmDelete, edit, save, cancel, amount, description, category, date, placeholdersExpense[], placeholdersIncome[], reportsTitle, reportsSubtitle, week, month, year, allTime, exportToExcel, financialReport, period, type, expenseType, incomeType, totalIncome, totalExpenses, balance, savingsRate, visualizations, pie, bar, trend, noData, categoryBreakdown, noExpenses, noIncome` + una clave por cada slug de categoría.

Curiosidad: **el `appTitle` es "Chat Dinero" / "Money Chat"**, no "Flow Finance" — eso solo aparece en los meta tags. Decidí cuál querés.

⚠️ Buena parte de las páginas nuevas (Savings, FixedExpenses, ExchangeRateConfig, Settings) **no usa el diccionario**: hace `language === "es" ? "…" : "…"` inline. Categories está directamente hardcodeada en español. Si vas a reconstruir, unificá esto.

---

## 8. Backend

### Lo que hace Base44 hoy

- **Auth:** OAuth con redirect a `/login`, token en `localStorage` (`base44_access_token`).
- **Entidades:** CRUD REST genérico (`/apps/{appId}/entities/{Entity}`) con `list`, `filter`, `create`, `update`, `delete`, `bulkCreate`, `import`, `subscribe` (realtime vía socket.io).
- **Aislamiento de datos:** la app filtra por `created_by: user.email` **desde el cliente**. Si Base44 no aplica RLS del lado servidor, cualquiera con el token puede leer todo. Ver hallazgo H-1.
- **Backend function:** una sola, `fetchUsdBlue({ user_id })`. Debería: pegarle a `source_url`, parsear la cotización, actualizar `ExchangeRateConfig` (`last_value`, `last_updated_at`, `last_status`, `last_error`) y crear un `ExchangeRateHistory`. Devuelve `{ success, rate, error }`.
- **Cron:** el campo `refresh_minutes` implica una tarea programada del lado de Base44 que no puedo ver.

### Mapeo sugerido a un stack propio

| Base44 | Equivalente sugerido |
|---|---|
| Entidades | Postgres + Prisma / Drizzle |
| `filter({created_by})` | **Row Level Security por `user_id`** (no filtro en cliente) |
| Auth | Supabase Auth / Auth.js / Clerk |
| `fetchUsdBlue` | Route handler o edge function |
| `refresh_minutes` | Cron (Vercel Cron, pg_cron, Supabase scheduled function) |
| Realtime | Opcional — la app no lo usa realmente |

---

## 9. Hallazgos: bugs, riesgos y deuda

Ordenados por gravedad. **Estos son los que yo arreglaría en la reconstrucción en lugar de replicar.**

| # | Severidad | Hallazgo |
|---|---|---|
| **H-1** | 🔴 Alta | **`CategoryLearning` se consulta sin `created_by`.** Los dos accesos (`filter({type})` y `filter({keyword, type})`) omiten el owner. Si Base44 no fuerza RLS, el aprendizaje de categorías se comparte entre todos los usuarios: si otro usuario asocia "uber" a `shopping`, te lo aplica a vos. |
| **H-2** | 🔴 Alta | **`SavingsContribution` nunca se escribe.** El botón "Agregar" solo hace `update` de `currentSavedAmount`. Consecuencia: la "Estimación" de cada objetivo devuelve siempre `"Sin datos"` y no hay historial de aportes. La entidad existe pero la feature está muerta. |
| **H-3** | 🟠 Media | **`Transaction` no tiene `currency`.** `FixedExpense` sí (ARS/USD), pero al registrar se descarta: un gasto fijo en USD entra como un número suelto sin conversión ni marca. Y el parser convierte USD→ARS al momento de escribir, así que si mañana cambia la cotización el histórico queda inconsistente. Definí una moneda base y guardá `currency` + `fx_rate` en cada transacción. |
| **H-4** | 🟠 Media | **El diccionario de categorización es solo inglés.** La app está en español por defecto y los propios placeholders sugieren escribir en español ("almuerzo", "supermercado"), pero ninguna de esas palabras está en el diccionario → todo cae en `other` hasta que el usuario corrija manualmente. Es la mejora de UX más grande y más barata. |
| **H-5** | 🟠 Media | **`et.backend.functions.fetchUsdBlue` no existe.** El SDK expone `functions`, no `backend.functions`. La llamada tira `TypeError`, lo captura el `onError` de la mutación y se muestra como toast. **El botón "Actualizar Ahora" está roto en producción.** Lo correcto sería `et.functions.fetchUsdBlue(...)`. |
| **H-6** | 🟡 Baja | **Tope duro de 500 transacciones** en Home y Reports, sin paginación. Con uso sostenido, los reportes empiezan a mentir en silencio. |
| **H-7** | 🟡 Baja | **`new Function()` para evaluar expresiones**, en el parser y en el form de ahorros. Está sanitizado con regex y el input es del propio usuario, así que el riesgo real es bajo — pero es innecesario. Usá un parser de expresiones (ej. `expr-eval`) o un shunting-yard de 30 líneas. |
| **H-8** | 🟡 Baja | **`/Savings` es huérfana** en la navegación (solo desde Reports). |
| **H-9** | 🟡 Baja | **Dos acciones "cancelar"** en FixedExpenses: una setea `cancellationDate` y otra no. Probablemente sean "cancelar" vs "eliminar" pero ambas terminan en `status: "cancelled"`. Semántica confusa. |
| **H-10** | 🟡 Baja | **Sin `error`/`isLoading` en la mayoría de las queries.** Si falla la red, la UI muestra estado vacío en vez de un error. |
| **H-11** | ⚪️ Nota | **i18n inconsistente** (sección 7) y **el click para ver detalle de categoría solo funciona en el gráfico de barras**, no en la torta ni en el desglose. |

---

## 10. Plan de replicación propuesto

Con criterios de verificación por paso, para que se pueda avanzar sin frenar a preguntar.

**Fase 0 — Decisiones (te toca a vos, ver sección 11)**
Backend objetivo, alcance de los fixes, fidelidad visual.

**Fase 1 — Andamiaje**
1. Vite + React + TS + Tailwind v3 + shadcn/ui (tema neutral, `--radius: .5rem`) → *verificar:* `npm run build` limpio y un botón de shadcn renderiza.
2. Router con las 7 rutas + 404 → *verificar:* navegar a cada una da un placeholder, no un blanco.

**Fase 2 — Datos**
3. Schema (sección 4) + migraciones → *verificar:* `migrate` corre desde cero en una DB vacía.
4. RLS/ownership por usuario, **incluyendo `CategoryLearning`** → *verificar:* test de integración donde el usuario B no ve nada del usuario A.
5. Auth + sesión → *verificar:* rutas protegidas redirigen a login.

**Fase 3 — Lógica de negocio (lo más valioso, y testeable sin UI)**
6. Portar el parser como módulo puro con tests → *verificar:* casos de la sección 6.1 — `"$20 lunch"`, `"3*15 coffee"`, `"1.234,56 super"`, `"50 usd freelance"`, `"asdf"` (monto 0), y prioridad de `CategoryLearning` sobre keywords.
7. Diccionario + colores + íconos → *verificar:* snapshot test de la categorización.

**Fase 4 — Pantallas**, en este orden (cada una habilita la siguiente):
8. Home/chat → 9. Categories → 10. Reports + export → 11. FixedExpenses → 12. Savings → 13. Settings + ExchangeRate.
*Verificar cada una:* alta, edición, borrado y refetch correcto de react-query.

**Fase 5 — Integración externa**
14. Endpoint `fetchUsdBlue` + cron → *verificar:* correrlo escribe `last_value` y una fila de historial; con `source_url` inválida escribe `last_status: "error"` sin romper.

**Fase 6 — Cierre**
15. i18n unificado, PWA/manifest, deploy.

---

## 11. Necesito que decidas cuatro cosas

Estas cuatro determinan gran parte del código. Sin ellas voy a tener que asumir, y prefiero preguntarte:

1. **¿Qué backend?**
   (a) Seguir con Base44 y solo sacar el front a un repo — el camino más corto pero seguís atado a la plataforma.
   (b) Supabase (Postgres + Auth + RLS + cron) — el reemplazo más parejo, migración casi 1:1.
   (c) Backend propio (Node/Hono/Next API + Postgres) — máximo control, más trabajo.

2. **¿Replicar o corregir?** ¿Querés una copia fiel (bugs incluidos, útil si hay datos productivos que dependen del comportamiento actual) o una v2 con los hallazgos de la sección 9 resueltos? Mi recomendación: corregir H-1 a H-5, dejar el resto para después.

3. **¿Migran datos?** Si hay transacciones reales en Base44, hace falta un export y un script de migración — y ahí los schemas reales dejan de ser opcionales.

4. **¿Fidelidad visual?** ¿Píxel a píxel con lo actual, o es una oportunidad para rehacer la UI? Tengo todas las clases de Tailwind y los colores exactos, así que ambas son viables.

Con eso definido puedo armar el repo, el schema y empezar por el parser (que es lo que más valor tiene y lo más fácil de verificar con tests).
