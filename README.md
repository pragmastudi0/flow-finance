# Flow Finance

Finanzas personales por chat. Escribís `3*15 cafés` o `45320 coto` y la app saca
monto, descripción y categoría sola. También podés sacarle una foto al ticket y
que la lea un modelo de visión.

Stack: React + TypeScript + Vite + Tailwind, Supabase (Postgres, Auth, Storage,
Edge Functions).

---

## Arranque

```bash
npm install
cp .env.example .env      # completá con tus credenciales de Supabase
npm run dev
```

Base de datos:

```bash
supabase db push
```

Análisis de tickets (opcional, ver más abajo):

```bash
supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=...
supabase functions deploy analyze-receipt
```

Verificación:

```bash
npm test           # 39 tests
npx tsc --noEmit
npm run build
```

---

## Estado

**Listo:**

- Schema completo con RLS por usuario, sobre Postgres
- Parser de lenguaje natural (montos, expresiones matemáticas, formatos ES/EN, USD)
- Diccionario de categorización: 537 keywords, español e inglés, con comercios argentinos
- Análisis de tickets con IA: bucket privado, edge function, validación estricta, cuota por usuario
- Diccionario i18n unificado ES/EN
- Rutas y providers

**Pendiente:** las 7 pantallas y la capa de acceso a datos con react-query.

---

## Categorización

Dos mecanismos, en orden de prioridad:

1. **Lo aprendido.** Cuando corregís la categoría de un movimiento, se guarda la
   asociación y la próxima vez gana sobre todo lo demás. Es por usuario.
2. **El diccionario.** 537 keywords repartidas en 14 categorías: vocabulario
   cotidiano en español e inglés, comercios y cadenas argentinas (Coto, Carrefour,
   YPF, Farmacity, Edenor, Rappi, Mercado Libre…) y nombres de producto, que es
   lo que aparece como renglón en un ticket.

Dos detalles que cambian bastante el resultado:

**Se ignoran las tildes.** `fold()` normaliza texto y keyword antes de comparar,
así que "cafe" matchea "café" y no hace falta duplicar entradas.

**El match está anclado a la palabra**, con sufijo plural opcional. Con
`includes()` a secas, "pan" matchea "pantalon" y te manda un pantalón a
supermercado. Ahora "cafe" sigue matcheando "cafes" y "café", pero "pan" no
matchea "pantalon". Hay tests para eso.

Un test verifica que ninguna keyword esté en dos categorías del mismo lado: si
está repetida, se anulan en el scoring y ambas categorías empeoran.

Si algo cae mal, corregilo una vez en la UI y queda aprendido. Ese es el diseño:
el diccionario cubre lo común, el aprendizaje cubre lo tuyo.

---

## Análisis de tickets con IA

Sacás la foto, la app la sube a un bucket privado, una edge function se la manda
a un modelo de visión y te devuelve comercio, total, fecha y renglones. **No
guarda nada solo**: te muestra lo que leyó para que confirmes.

### Arquitectura

```
navegador                     edge function                proveedor
  │                                 │                          │
  ├─ sube la foto ────────────▶ bucket privado                 │
  ├─ inserta receipt (pending)      │                          │
  ├─ invoca analyze-receipt ──▶ valida sesión                  │
  │                            reclama cuota diaria            │
  │                            baja la imagen                  │
  │                            ─────────────────────────────▶  │
  │                            valida la respuesta ◀──────────  │
  │                            guarda los campos                │
  ◀─ extracción ──────────────────┘                            │
  └─ el usuario confirma → se crea la transacción
```

La clave de API vive **solo** en los secrets de la edge function. Una key de
visión en el navegador es una key que cualquiera saca de devtools y te gasta.

### Qué proveedor usar

Verificado el 23/07/2026. Los tiers gratuitos cambian seguido — confirmá antes de
depender de esto.

| | Gemini (Google AI Studio) | Groq |
|---|---|---|
| Tarjeta de crédito | no | no |
| Visión en el tier gratis | sí | sí, en modelos preview |
| Límites | varían por modelo y proyecto; Google los recortó fuerte en dic-2025 | ~30 req/min, con tope diario |
| Calidad en tickets | mejor | aceptable |
| Usa tus datos para entrenar | **sí en el tier gratis** | revisar términos |

**Gemini** es el default: lee mejor los tickets argentinos, sobre todo los
térmicos borroneados. **Groq** es más rápido y sirve de respaldo cuando Gemini
devuelve 429.

Para cambiar: `supabase secrets set AI_PROVIDER=groq GROQ_API_KEY=...`. El
adaptador está en `analyze-receipt/index.ts`; agregar un tercero son ~20 líneas.

### El costo real de "gratis"

Google dice explícitamente que en el tier gratuito **usa las entradas y salidas
para mejorar sus modelos**. Un ticket de compra no es un dato neutro: tiene
dónde comprás, cuándo, cuánto gastás y a veces los últimos dígitos de tu tarjeta.

Tres opciones, en orden de costo:

1. **Tier gratis y listo.** Aceptable para uso personal si el tema no te molesta.
2. **Habilitar billing.** El tier pago no entrena con tus datos. Un ticket son
   centavos; con 25 análisis por día no llegás a un dólar por mes. Ojo: al
   habilitar billing en un proyecto, el tier gratuito de ese proyecto desaparece
   por completo y todo pasa a facturarse desde el primer token.
3. **Un modelo local.** Cero fuga de datos, pero necesitás una máquina que lo
   aguante.

Si el tema te importa, la opción 2 es la que yo elegiría: el costo es
despreciable y es la única diferencia relevante.

Dos mitigaciones que ya están puestas igual: la imagen vive en un bucket privado
con acceso por URL firmada, y la cuota diaria por usuario (`AI_DAILY_LIMIT`,
default 25) evita que una persona queme el cupo compartido de todo el proyecto.

### Qué pasa cuando el modelo se equivoca

Se equivoca. `parseReceiptResponse` es la frontera donde se contiene:

- Ignora los ``` con los que a veces envuelve el JSON, y la prosa alrededor
- Acepta el total como número o como `"1.234,56"`
- Descarta fechas imposibles: 31 de febrero, futuras, o de hace tres años
- Recorta la confianza a 0–1 y rechaza la respuesta si es 0
- Tira los renglones basura sin tirar el ticket entero
- Si no hay total usable, devuelve `null` en vez de inventar un movimiento

Por debajo de 0.7 de confianza, el draft viene con `needsReview: true` y la UI
tiene que abrir el formulario de edición en vez de guardar directo.

---

## Estructura

```
src/
├── domain/          lógica pura, sin React ni red
│   ├── categories.ts    categorías, keywords, colores, íconos
│   ├── parser.ts        texto libre → transacción
│   ├── receipt.ts       prompt, validación de la respuesta, draft
│   └── *.test.ts
├── i18n/            diccionario + provider
├── lib/             cliente Supabase, subida de tickets, cn()
├── types/           modelos de dominio
└── App.tsx          rutas y providers
supabase/
├── migrations/      schema con RLS
└── functions/
    ├── _shared/         reexporta src/domain (sin duplicar código)
    └── analyze-receipt/ visión, con adaptador de proveedor
docs/MIGRATION.md    mapeo para importar los datos viejos
```

`domain/` no importa React ni el cliente de datos, y usa specifiers `.ts`
explícitos. Por eso la edge function puede cargar los mismos archivos que testea
el front, en vez de una copia que se desincroniza en silencio.

---

## Decisiones que se apartan de la app original

Cada una responde a algo que estaba roto.

**Aislamiento de datos.** Antes se filtraba por email desde el navegador, y el
aprendizaje de categorías ni eso: era global entre todos los usuarios. Ahora cada
tabla tiene RLS `user_id = auth.uid()`.

**Aportes de ahorro.** Antes se leía la tabla de aportes pero nunca se escribía,
así que la estimación "en camino / requiere más ahorro" siempre decía "sin
datos". Ahora los aportes son la fuente de verdad y el progreso sale de una
vista. Restar graba una fila negativa, que además deja historial.

**Moneda.** Antes se convertía USD→ARS al escribir y se guardaba un número
pelado, así que el histórico se corrompía cuando cambiaba la cotización. Ahora se
guardan los tres datos: monto como se tipeó, moneda y cotización aplicada. Sin
cotización disponible, la entrada en USD se rechaza en vez de guardar basura.

**Categorización en español.** El diccionario era solo inglés aunque la app
arranca en español: "almuerzo" caía en "otros".

**Evaluación de expresiones.** Antes se usaba `new Function()` para resolver
`3*20`. Ahora hay un parser recursivo de ~50 líneas: misma gramática, sin
ejecutar código.

**Sin tope de 500.** Las consultas se acotan por rango de fechas, con índices por
`(user_id, occurred_on)`. Antes había un límite duro de 500 movimientos y los
reportes empezaban a mentir en silencio al pasarlo.

---

## Próximo paso

1. Capa de datos: hooks de react-query sobre Supabase → *verificar:* CRUD contra una base local
2. Componentes base (Button, Card, Dialog, Input, Select)
3. Home / el chat, con el botón de cámara → *verificar:* alta por texto y por foto, con confirmación
4. Categories → Reports + export → FixedExpenses → Savings → Settings
5. Cron del tipo de cambio → *verificar:* con URL inválida escribe estado `error` sin romper
