# Flow Finance — Análisis de innovación y mejora continua

Fecha: 30/08/2026 · Alcance: producto completo (arquitectura, flujos, datos, UX, IA)
· Estado del repo analizado: `main` @ `e1d05ae`

Este documento no busca bugs. Busca respuesta a una sola pregunta: **¿qué podría
hacer el sistema por el usuario que hoy el usuario todavía tiene que hacer solo?**

---

## 0. Qué es hoy Flow Finance

**Stack.** React 18 + Vite + TypeScript + Tailwind. Supabase: Postgres con RLS
por usuario, Auth, Storage privado, 4 Edge Functions (`ai-insights`, `ai-chat`,
`analyze-receipt`, `reconcile-match`). react-query como capa de datos.

**Decisión de arquitectura que vale la pena destacar:** `src/domain/` es lógica
pura con specifiers `.ts` explícitos, y `supabase/functions/_shared/` la
reexporta en vez de duplicarla. El parser, el diccionario de categorías y el
motor de conciliación son *el mismo código* en el navegador y en Deno. Eso está
bien resuelto y es la base sobre la que se apoya casi todo lo que propongo
abajo.

**Módulos.**

| Pantalla | Qué hace | Estado real |
|---|---|---|
| Home | Alta por lenguaje natural (`3*15 cafés`), foto de ticket, lista por mes | Núcleo del producto, el flujo más pulido |
| Reports | Torta/barras por categoría, 4 períodos fijos, export a Excel | Correcto pero pasivo |
| AI Insights | Reporte mensual cacheado + chat sobre los datos | Potente, pero encerrado |
| Savings | Metas con aportes como fuente de verdad | Sólido, aislado del resto |
| Categories | 14 built-in + custom + aprendizaje por keyword | Bien resuelto |
| Fixed Expenses | Registro de suscripciones y cuotas | **No hace nada** (ver §1) |
| Exchange Rate | Cotización blue, historial, config de refresco | Config que no se ejecuta |
| Reconciliation | Import de resumen PDF, fingerprint, scoring 3 señales, veredicto IA | Lo más sofisticado del producto, y lo más subutilizado |

**Modelo de datos.** 12 tablas, todas con RLS `user_id = auth.uid()`. Bien
normalizado, bien indexado, con detalles que denotan criterio: `fingerprint`
único por movimiento bancario, índice parcial único que impide que una
transacción sea contraparte de dos movimientos, aportes de ahorro como fuente de
verdad en vez de un `current_saved_amount` mutable, moneda guardada como
`(amount, currency, fx_rate)` en vez de un número ya convertido.

**El diagnóstico de una línea:** la ingeniería está por delante del producto. Hay
un motor de conciliación de nivel fintech alimentando una pantalla que se usa una
vez por mes, y hay un módulo de gastos fijos que es literalmente un cementerio de
filas. El sistema sabe muchísimo y no dice casi nada.

---

## Executive Summary — las 10 oportunidades más importantes

1. **Los gastos fijos no generan nada.** El usuario carga Netflix, y no pasa
   absolutamente nada más: no aparece en Home, no genera movimiento, no avisa
   antes del débito, `remaining_installments` nunca se decrementa. Es la brecha
   producto↔promesa más grande del sistema.
2. **No existen presupuestos.** Es la funcionalidad más estándar de la categoría
   y no está. Sin presupuesto no hay alerta posible, no hay "vas 80% de comida y
   estamos a día 12", no hay semáforo, no hay nada que empuje al usuario a
   volver.
3. **El sistema es 100% pasivo.** Cero jobs programados, cero push, cero mail.
   Todo el valor de IA está detrás de un botón que el usuario tiene que apretar.
   Un producto de finanzas que no te avisa nada es un cuaderno con gráficos.
4. **No hay buscador. En ninguna pantalla.** "¿Cuánto gasté en Coto este año?"
   hoy se responde exportando a Excel. Es el trabajo invisible más caro y el
   arreglo más barato.
5. **La conciliación resuelve el problema equivocado.** Está diseñada como
   auditoría mensual ("¿cargué todo?") cuando es, de hecho, el mejor canal de
   ingesta de datos del producto: el resumen trae comercio, medio de pago, fecha
   y cuota exacta, sin que el usuario tipee nada.
6. **Los movimientos `unmatched` son oro y se tiran.** El sistema ya sabe
   exactamente qué gastos se le escaparon al usuario y solo ofrece cargarlos de a
   uno. Ahí está la detección de suscripciones, de aumentos de precio, de
   débitos olvidados y de cuotas activas.
7. **Pedir una API key propia mata la adopción de la IA.** Es la mejor parte del
   producto detrás de la peor barrera posible: "andá a Google AI Studio, generá
   una clave y pegala acá".
8. **AI Insights está clavado al mes actual.** La tabla `flowfinance_ai_reports`
   guarda una fila por mes con índice `(user_id, month desc)`, y la UI hace
   `useMemo(() => monthKey(new Date()), [])`. Hay historial almacenado que es
   inalcanzable.
9. **Falta la noción de cuenta y de comercio.** Sin `account_id` no hay saldo
   real ni patrimonio, solo ingresos−gastos del mes. Sin `merchant` normalizado
   no hay "gasté X en Coto", ni ranking de comercios, ni detección de precios.
10. **PWA a medias y single-user.** Manifest sin service worker: sin offline,
    sin push, sin instalación de calidad. Y no hay cuentas compartidas, que es el
    caso de uso más grande de finanzas personales que el producto no cubre.

---

## 🔥 Top Opportunities

Escala 1–10. **Prioridad** = (Impacto + Valor usuario + Valor estratégico +
Diferenciación) − (Esfuerzo + Dificultad).

| # | Prio | Oportunidad | Problema actual | Solución propuesta | Imp | Esf | Dif |
|---|---|---|---|---|--:|--:|--:|
| 1 | 🔴 CRÍTICA | **Motor de recurrencias** | Gastos fijos son filas muertas; no proyectan, no avisan, no descuentan cuotas | Job diario que materializa el movimiento el día que corresponde (o lo propone), decrementa cuotas, cierra al llegar a 0 y proyecta el mes | 10 | 5 | 4 |
| 2 | 🔴 CRÍTICA | **Presupuestos + pacing** | No existe el concepto de límite | Tabla `budgets(category, amount, period)`, barra de ritmo en Home, alerta al 80% y al proyectar sobrepaso | 10 | 4 | 3 |
| 3 | 🔴 CRÍTICA | **Capa proactiva (cron + push)** | Todo es pull; el usuario tiene que acordarse de entrar | `pg_cron` + edge function diaria/semanal + Web Push. Resumen del lunes, alerta de presupuesto, aviso de débito, anomalías | 10 | 6 | 5 |
| 4 | 🟠 ALTA | **Buscador global + filtros** | No hay búsqueda en toda la app | Barra de búsqueda con `tsvector` sobre descripción + filtros por monto/fecha/categoría/medio de pago, y torta clickeable que filtra | 9 | 3 | 2 |
| 5 | 🟠 ALTA | **Conciliación como ingesta** | Import manual mensual, uno a uno | "Importar todo lo que falta" en un tap: los `unmatched` se convierten en transacciones con comercio, medio de pago y cuota ya cargados | 9 | 4 | 3 |
| 6 | 🟠 ALTA | **Detector de suscripciones y aumentos** | El resumen muestra las recurrencias y nadie las lee | Detectar periodicidad en el histórico + resumen, ofrecer alta de gasto fijo, y avisar cuando el mismo comercio sube de precio | 9 | 5 | 5 |
| 7 | 🟠 ALTA | **Clave del proyecto para IA** | BYO API key como default | Key del proyecto con cuota gratuita mensual; la key propia queda como opción avanzada ("ilimitado con tu clave") | 9 | 2 | 2 |
| 8 | 🟠 ALTA | **`merchant` + `account_id`** | Sin comercio normalizado ni cuentas; el balance no es patrimonio | Persistir comercio normalizado en alta y conciliación; tabla de cuentas/tarjetas con saldo | 8 | 6 | 5 |
| 9 | 🟠 ALTA | **Offline-first + voz + share target** | PWA sin SW; no se puede cargar en el súper sin señal | Service worker con cola de escritura, dictado por voz sobre el parser, share target para tickets | 8 | 5 | 5 |
| 10 | 🟡 MEDIA | **Historial de AI Insights** | Solo mes actual, aunque el histórico está guardado | Selector de mes + comparativa entre reportes | 7 | 2 | 1 |
| 11 | 🟡 MEDIA | **Cuentas compartidas (modo pareja)** | Single-user duro | Tabla de miembros, RLS por household, atribución por persona | 8 | 8 | 7 |
| 12 | 🟡 MEDIA | **Importar CSV/Excel** | Exporta pero no importa | Mapeo de columnas asistido reusando el motor de conciliación | 7 | 4 | 3 |
| 13 | 🟡 MEDIA | **Aprendizaje de la conciliación** | Rechazar un match no entrena nada | Guardar los rechazos y realimentar el scoring y el `payment_method` inferido | 7 | 4 | 5 |
| 14 | 🔵 EXP | **Ingesta por mail** | Los resúmenes y comprobantes llegan al mail | Dirección `usuario@in.flowfinance.app` que parsea lo que le reenvíen | 8 | 7 | 7 |
| 15 | 🔵 EXP | **Gastos compartidos / split** | No existe | Dividir un gasto, saldo con cada persona, cierre de cuentas | 7 | 7 | 6 |

---

## 🚀 Quick Wins

Cambios chicos, impacto desproporcionado. Todos entran en un sprint.

1. **Selector de mes en AI Insights.** El dato ya está en la base. Es cambiar un
   `useMemo` con array de dependencias vacío por estado. *Media hora, desbloquea
   el histórico entero.*
2. **Buscador en Home y Reports.** Filtro en memoria como primera versión (Home
   ya carga todo el histórico), `tsvector` cuando escale.
3. **Torta clickeable.** Tocar una porción filtra la lista de abajo. La
   visualización hoy es un cul-de-sac: mirás y no podés hacer nada con lo que
   viste.
4. **Rango de fechas custom en Reports.** Los cuatro períodos están anclados a
   hoy; no se puede ver "julio".
5. **"Repetir" en la fila de un movimiento.** Un tap crea el mismo gasto con
   fecha de hoy. Cubre el café diario, la carga de nafta, el almuerzo.
6. **Chips de sugerencia en el sheet de alta.** Los 5 gastos más frecuentes del
   usuario como botones. Alta sin teclado.
7. **Total del mes proyectado en el header.** Ya se calculan ingresos y gastos;
   falta la línea "a este ritmo terminás en $X".
8. **Estado vacío accionable.** Hoy Home vacío es un párrafo de texto. Debería
   ofrecer: cargar el primero, sacar foto a un ticket, importar un resumen.
9. **Badge en Settings → Conciliación** cuando hay movimientos pendientes de
   revisar. La función más valiosa está escondida a dos niveles de navegación.
10. **`payment_method` inferido en la conciliación.** El resumen es de tarjeta:
    todo lo que se concilia contra él es `credit`. Es rellenar un hueco que hoy
    queda `null` para siempre.
11. **Mostrar el veredicto de por qué un match tiene ese score.** El breakdown de
    3 señales ya se calcula y se guarda en `match_detail`; exponerlo entero
    genera confianza en el motor.
12. **Deduplicación al vuelo.** Si el usuario carga un monto idéntico al mismo
    comercio el mismo día, preguntar "¿es el mismo?" antes de guardar.

---

## 🤖 Oportunidades de IA

Sin IA decorativa. Cada ítem tiene un problema real detrás.

### 1. Categorización semántica como tercer escalón
- **Problema.** El diccionario tiene 537 keywords y el aprendizaje es
  `keyword → categoría` con match exacto anclado a palabra. "Almacén de Doña
  Rosa" cae en `otros` y va a seguir cayendo hasta que el usuario lo corrija a
  mano.
- **Solución.** Embeddings + pgvector: al no matchear el diccionario, buscar por
  similitud semántica en las descripciones ya categorizadas por *este* usuario.
- **Por qué IA.** El problema es de significado, no de texto. Ninguna keyword
  nueva resuelve la cola larga de comercios de barrio.
- **Beneficio.** El "otros" tiende a cero sin trabajo del usuario.
- **Complejidad.** Media. pgvector + un job de embeddings. El fallback ya existe.

### 2. Detección de anomalías con contexto
- **Problema.** `suspiciousExpenses` existe en el reporte mensual, pero llega el
  día que el usuario decide entrar, no el día que pasó algo raro.
- **Solución.** Chequeo diario contra la línea base propia del usuario: monto
  fuera de rango para ese comercio, cargo duplicado, comercio nunca visto con
  monto alto, suscripción que subió.
- **Por qué IA.** El umbral estadístico solo da falsos positivos ("gastaste más
  que el promedio" en el mes de las vacaciones). El modelo puede distinguir gasto
  inusual de gasto explicable.
- **Beneficio.** Pasás de reportar el pasado a interceptar el presente.
- **Complejidad.** Media. La mitad estadística es determinista y barata; el
  modelo solo interviene en los casos dudosos — exactamente el patrón que ya usa
  `reconcile-match` con `aiVerdict`.

### 3. Chat con capacidad de acción
- **Problema.** `ai-chat` responde sobre el snapshot. Es un oráculo de solo
  lectura: podés preguntar cuánto gastaste, no podés pedirle que arregle nada.
- **Solución.** Tool calling: "recategorizá todos los Rappi de julio a comida",
  "poneme un presupuesto de 200 mil en salidas", "borrá el duplicado del martes".
  Con confirmación explícita antes de escribir.
- **Por qué IA.** Es lenguaje natural sobre una superficie de acciones amplia:
  ninguna UI cubre esa combinatoria sin volverse un panel de control.
- **Beneficio.** La app entera se vuelve operable por texto, coherente con la
  promesa original ("finanzas por chat").
- **Complejidad.** Media-alta. El riesgo es de escritura, no de modelo: toda
  acción necesita preview y undo.

### 4. Explicación del mes en una frase, calculada sola
- **Problema.** El reporte tiene 12 campos. Nadie lee 12 campos.
- **Solución.** Una sola línea arriba de Home: "Gastaste 23% más que julio,
  casi todo en salidas: 4 cenas contra 1".
- **Por qué IA.** El diff mes contra mes es determinista; volverlo una frase que
  se entienda de un vistazo no lo es.
- **Beneficio.** El insight llega sin que el usuario navegue a buscarlo.
- **Complejidad.** Baja. El snapshot ya existe en `_shared/finance.ts`.

### 5. Lectura de resúmenes de cualquier banco
- **Problema.** El parser de PDF es a medida. Cada banco nuevo es trabajo.
- **Solución.** Cuando el parser determinista no reconoce el formato, mandar el
  texto al modelo con el schema de `BankMovement`, y guardar el layout aprendido
  para no volver a gastar la llamada.
- **Por qué IA.** Los layouts de resumen son infinitos y cambian sin aviso.
- **Beneficio.** Cobertura de bancos sin desarrollo por banco.
- **Complejidad.** Media. La frontera de validación ya está construida
  (`parseReceiptResponse` es el modelo a copiar).

### 6. Coach de metas de ahorro
- **Problema.** Savings muestra progreso. No dice cómo llegar.
- **Solución.** Cruzar meta, fecha objetivo y gasto real: "para llegar en
  diciembre necesitás 45 mil por mes; salidas te está costando 60 mil —
  recortando un tercio llegás".
- **Por qué IA.** Es priorizar entre recortes posibles según lo que se ve que el
  usuario valora, no una división.
- **Beneficio.** Conecta el único módulo aspiracional con el resto del producto.
- **Complejidad.** Baja-media. Los datos ya están en el snapshot.

### 7. Ticket → renglones categorizados
- **Problema.** `analyze-receipt` ya lee los renglones del ticket y después
  guarda una sola transacción con el total.
- **Solución.** Ofrecer split: 12 mil de supermercado, 4 mil de limpieza, 2 mil
  de mascotas — desde el mismo ticket.
- **Por qué IA.** La visión ya se pagó; los renglones ya se extrajeron. Es
  aprovechar trabajo hecho.
- **Beneficio.** Granularidad real de categorías sin trabajo manual.
- **Complejidad.** Baja. El dato está; falta UI y un `parent_transaction_id`.

---

## ⚙️ Automatizaciones

Todo lo que hoy es trabajo humano y no debería serlo.

| Hoy lo hace el usuario | Debería hacerlo el sistema |
|---|---|
| Recordar que el 10 se debita Netflix | Materializar el movimiento el día que corresponde, o proponerlo |
| Llevar la cuenta de en qué cuota va | Decrementar `remaining_installments` y cerrar el gasto fijo al llegar a 0 |
| Entrar a AI Insights y apretar generar | Generarlo el día 1 de cada mes y notificarlo |
| Entrar a ver si se pasó de gasto | Alerta al cruzar el umbral, no al final del mes |
| Refrescar la cotización | Ejecutar el `refresh_minutes` que ya está en la tabla y hoy nadie lee |
| Cargar de a uno los `unmatched` del resumen | Importar todo lo faltante en una acción, con preview |
| Detectar que pagó dos veces lo mismo | Chequeo de duplicados al escribir y al conciliar |
| Exportar a Excel para responder una pregunta | Responderla en la app (buscador + chat) |
| Corregir la misma categoría una y otra vez | Ya funciona (aprendizaje + recategorización masiva) — extenderlo a lo semántico |
| Acordarse de conciliar | Avisar cuando llega la fecha de cierre de la tarjeta ya conocida (`closing_date`) |
| Comparar el resumen contra los gastos | Ya funciona — falta que corra solo con el archivo recién llegado |
| Borrar registros viejos de `ai_usage` | El comentario en `0004_production.sql` dice "correr periódicamente" y nadie lo corre |

**El patrón:** el producto tiene tres tablas con campos de configuración de
periodicidad (`refresh_minutes`, `recurrence`, `remaining_installments`) y **no
tiene un solo scheduler**. Poner `pg_cron` es la palanca individual más grande
del sistema: desbloquea siete de las filas de esta tabla a la vez.

---

## 🧠 Inteligencia y Proactividad

De "un lugar donde entro a hacer cosas" a "algo que me avisa qué debería hacer".

**Lo que el sistema ya sabe y no dice:**

- Sabe la fecha de cierre y de vencimiento de la tarjeta (`closing_date`,
  `due_date` en `flowfinance_statement_imports`) → puede avisar el vencimiento.
- Sabe qué gastos se le escaparon al usuario (`status = 'unmatched'`) → puede
  decir "te faltan 7 movimientos de agosto".
- Sabe qué gastos fijos están activos → puede avisar antes del débito.
- Sabe cuántas cuotas quedan → puede decir "en noviembre se te liberan 45 mil".
- Sabe el ritmo de gasto del mes → puede proyectar el cierre desde el día 10.
- Sabe la meta de ahorro y su fecha → puede avisar cuando se está atrasando.
- Sabe la cotización histórica → puede avisar un salto relevante si el usuario
  tiene gastos en USD.
- Sabe qué categorías subieron respecto al mes anterior → puede señalar la causa.

**Momentos donde debería aparecer:**

| Momento | Mensaje |
|---|---|
| Lunes a la mañana | "La semana pasada gastaste $X. Comida se llevó el 40%." |
| Día 1 | "Tu reporte de agosto está listo." |
| Al cruzar el 80% de un presupuesto | "Salidas: 82% del presupuesto y estamos a día 14." |
| 2 días antes de un débito fijo | "Mañana se debita Netflix ($X)." |
| Al cerrar la tarjeta | "Cerró tu Visa. Subí el resumen y lo concilio." |
| Cargo anómalo | "$45.000 en un comercio nuevo. ¿Fuiste vos?" |
| Suscripción que aumentó | "Spotify pasó de $X a $Y este mes." |
| Última cuota | "Terminaste de pagar la heladera. Te liberás $X por mes." |
| Meta atrasada | "Para llegar en diciembre te faltan $X/mes." |

**Regla de diseño para no volverse spam:** máximo una notificación por día,
priorizada por impacto en dinero, silenciable por tipo, y siempre con acción
directa desde la notificación (no "abrí la app y buscá").

---

## 🎯 UX / Product Improvements

**Fricción medida en el flujo principal (alta de un gasto):**
FAB → sheet → tipear → parsea → confirmar → elegir medio de pago → guardar.
Seis pasos para un café. Objetivo: dos.

- **Sin buscador en ninguna pantalla.** Es el hueco más notorio de toda la
  interfaz.
- **Reports renderiza la lista completa** sin virtualizar ni paginar; y
  `barData` en período semana/mes recorre el array de gastos una vez por día.
  Con historial grande, ambas cosas se sienten.
- **`useTransactions()` sin filtro en Home trae toda la historia** con
  `staleTime: 0` y filtra el mes en memoria. Es cómodo (habilita
  `findSimilarTransactions` sin costo de red) y no escala: con 20.000
  movimientos la app descarga todo en cada foco.
- **Jerarquía invertida en Settings.** Conciliación —la capacidad más
  diferencial— es una fila de lista dentro de Configuración. Categorías, gastos
  fijos y cotización compiten al mismo nivel visual.
- **La navegación tiene 5 tabs y 9 rutas.** Cuatro pantallas solo son
  alcanzables por Settings.
- **Sin onboarding.** El usuario nuevo ve una pantalla vacía con un párrafo. La
  sintaxis del parser (`3*15 cafés`, `45320 coto`, `100 usd`) es el corazón del
  producto y no se enseña en ningún lado.
- **Sin dark mode.** `theme-color` fijo en `#0f172a`, sin toggle ni respeto por
  `prefers-color-scheme`.
- **FixedExpenses es visualmente otra app.** Usa `Dialog` con inputs planos,
  `bg-white` hardcodeado y un badge que muestra el enum crudo (`active`,
  `cancelled`) sin traducir, mientras el resto del producto usa bottom sheets y
  tokens de color.
- **Sin estados de error diferenciados fuera de IA.** `AiError` distingue ocho
  códigos con mensajes propios; el resto de la app hace `toast.error(String(e))`.
- **Accesibilidad:** hay `aria-label` y `aria-current` en la nav, pero no hay
  foco visible consistente, ni navegación por teclado en las hojas, ni
  `prefers-reduced-motion` sobre las animaciones de Framer Motion.

**Si tuviera que hacerla 50% más simple, qué sacaría:** la pantalla de
cotización (el dato debería vivir inline donde importa, no ser una pantalla),
los 4 períodos fijos de Reports (un solo selector de rango), y la separación
Reports / AI Insights — son la misma pregunta contestada dos veces, una con
gráficos y otra con texto.

---

## 🧩 Funcionalidades Faltantes

### Imprescindibles
- Presupuestos por categoría con alertas.
- Que los gastos fijos generen movimientos y proyecten el mes.
- Búsqueda y filtros.
- Notificaciones (push y/o mail).
- Cuentas y tarjetas con saldo real (hoy no existe la noción de patrimonio).
- Importación de CSV/Excel.

### Importantes
- Historial navegable de reportes de IA.
- Detección de suscripciones y de aumentos de precio.
- Comercio normalizado y ranking por comercio.
- Modo offline con cola de escritura.
- Split de un ticket en varias categorías.
- Adjuntar comprobante a una transacción existente.
- Metas de ahorro conectadas al gasto real.

### Nice-to-have
- Dark mode.
- Tags además de categoría.
- Dictado por voz.
- Widget / atajo de iOS y Android.
- Reglas del usuario ("todo lo de YPF es transporte").
- Multi-moneda más allá de ARS/USD (hoy es un enum de Postgres: expandir requiere migración).
- Exportación a PDF además de Excel.

### Experimentales
- Ingesta por reenvío de mail.
- Gastos compartidos con saldo entre personas.
- Cuentas familiares con permisos por miembro.
- Open banking / agregación bancaria.
- Comparativa anónima contra usuarios similares.
- Proyección de inflación aplicada a los presupuestos (relevante en Argentina).

---

## 💡 Innovaciones

Doce ideas que hoy no existen en el sistema.

1. **Cierre de mes automático.** El día 1, la app arma sola el cierre: concilia,
   detecta lo faltante, genera el reporte y presenta una única pantalla de
   "revisá y confirmá". El usuario pasa de operador a auditor.
2. **Modo captura de 2 segundos.** Share target + voz + widget: sacar la foto del
   ticket desde la galería o dictar "mil quinientos nafta" sin abrir la app.
3. **Timeline de comercio.** Tocar "Coto" muestra todo el histórico con ese
   comercio, el ticket promedio y su evolución. Requiere `merchant` normalizado
   y convierte la app en memoria de precios personal.
4. **Radar de suscripciones.** Un panel con todo lo recurrente detectado, cuánto
   suma al mes, qué subió de precio y qué no se usa. Es el gancho de retención
   más probado del rubro.
5. **"¿Qué pasa si...?"** Simulador: "si dejo de pedir delivery, ¿llego a la
   meta?". Cruza el patrón real con la meta y responde con números propios.
6. **Presupuesto que se propone solo.** No pedirle al usuario que invente
   límites: proponerlos desde su propio histórico ("gastás 180 mil promedio en
   comida; ¿ponemos 170?").
7. **Liberación de cuotas.** Un calendario de cuándo termina cada cuota y cuánto
   ingreso disponible libera cada mes. Nadie lo muestra y todo el mundo lo
   calcula a mano.
8. **Undo universal con historial.** Toda escritura reversible y un log
   navegable. En finanzas personales el miedo a romper el registro es real; la
   reversibilidad total es una promesa comercializable.
9. **Chat como interfaz primaria.** Invertir la app: la pantalla principal es el
   chat, y las pantallas son vistas que el chat abre. Coherente con el origen del
   producto y difícil de copiar bien.
10. **Alerta de inflación personal.** Con comercio normalizado y precios de
    tickets: "tu canasta subió 8% este mes contra el 4% del mes pasado". Un IPC
    propio, calculado con datos que el sistema ya captura y descarta.
11. **Health score accionable.** El score existe en el reporte y es decorativo.
    Volverlo el eje: qué lo sube, qué lo baja, cuánto suma cada acción sugerida.
12. **Reglas visibles y editables.** Exponer el aprendizaje de categorías como
    reglas que el usuario puede ver, editar y ordenar, en vez de una caja negra
    que a veces acierta.

---

## 🔮 Ideas Futuras (1–3 años)

- **De registro a asistente.** El producto deja de ser donde anotás y pasa a ser
  quien lleva la contabilidad: vos revisás.
- **Agregación bancaria.** Cuando la conciliación por resumen esté madura, el
  paso natural es la conexión directa. El motor de matching ya es agnóstico de
  la fuente por diseño — está preparado para eso.
- **Finanzas del hogar.** Multi-persona con atribución, presupuestos compartidos
  y liquidación entre miembros.
- **Capa de precios.** Con suficientes tickets leídos, el producto sabe cuánto
  vale cada cosa en cada comercio. Eso es un activo que no se copia con código.
- **Puente a lo profesional.** El monotributista argentino usa la misma app para
  lo personal y lo laboral. Separar por cuenta, exportar para el contador,
  estimar el impuesto.
- **Motor de reglas del usuario.** Automatizaciones declarativas: "si un gasto de
  salud supera X, avisame"; "todo lo de Rappi los viernes es salidas".

---

## 🏆 La visión 10X

**Si pudiera rediseñarlo desde cero manteniendo solo el propósito:**

El propósito es *saber en qué se me va la plata sin trabajar para saberlo*. La
app actual cumple la segunda mitad a medias porque cargar sigue siendo trabajo,
aunque sea poco.

**La inversión:** hoy el default es que el usuario carga y el sistema, si acaso,
concilia. En la versión 10X el default se invierte — **el sistema carga y el
usuario, si acaso, corrige**. Todo lo que hoy es una pantalla de alta pasa a ser
una pantalla de confirmación.

Tres consecuencias de diseño:

1. **La ingesta es un pipeline, no un formulario.** Resumen de tarjeta, foto de
   ticket, CSV, mail reenviado y texto libre son cinco fuentes que caen en la
   misma cinta: normalizar → deduplicar → categorizar → proponer. La
   arquitectura ya lo soporta (`BankMovement` es fuente-agnóstico a propósito) y
   el producto todavía no lo usa así.
2. **La pantalla principal no es una lista, es una bandeja.** No "tus 47
   movimientos de agosto" sino "3 cosas necesitan tu atención": un cargo raro,
   un presupuesto por cruzarse, 7 movimientos del banco sin cargar. Vacía la
   bandeja y cerrás la app. Lo demás está disponible pero no te lo reclama.
3. **El chat es la superficie de acción, no una pestaña.** Preguntar y ordenar en
   el mismo lugar, con confirmación y undo. Es la promesa original del producto
   ("finanzas por chat") llevada a sus últimas consecuencias en vez de reducida a
   una caja de texto para dar de alta.

**Cómo se sentiría el mes:** cuatro notificaciones y dos minutos de revisión.
Nada de "cargar gastos".

**Por qué es difícil de copiar:** cualquiera copia una pantalla. El aprendizaje
por usuario, el motor de conciliación con fingerprint por movimiento, el
histórico de precios por comercio y la calidad de la categorización argentina son
activos que se acumulan con el uso. Ese es el moat, y ya está medio construido.

---

## Conclusión — "Si este fuera mi producto..."

### Las 5 cosas que haría primero, en orden

1. **Poner `pg_cron` y una edge function de jobs.** No es una feature, es la
   infraestructura que desbloquea siete features. Sin scheduler, la mitad de este
   documento es inejecutable.
2. **Hacer que los gastos fijos hagan algo.** Es la brecha más grande entre lo
   que el producto promete y lo que hace, y ya tiene tabla, enum y UI. Falta el
   motor.
3. **Presupuestos con alerta de ritmo.** El primer motivo real para que alguien
   quiera recibir una notificación de esta app.
4. **Sacar la barrera de la API key.** Toda la inversión en IA está detrás de un
   paso que el 90% de los usuarios no va a dar.
5. **Buscador y torta clickeable.** Dos días de trabajo que eliminan el motivo
   número uno por el que alguien abre Excel.

### Roadmap

**FASE 1 — Quick Wins (2–3 semanas)**
Buscador y filtros · torta clickeable · rango custom en Reports · selector de mes
en AI Insights · "repetir movimiento" · chips de sugerencia · proyección de
cierre en el header · badge de conciliación pendiente · `payment_method`
inferido · estados vacíos accionables.

**FASE 2 — Automatización (4–6 semanas)**
`pg_cron` + edge function de jobs · motor de recurrencias (materialización,
cuotas, proyección) · cotización que se refresca sola · reporte mensual generado
el día 1 · conciliación en lote ("importar todo lo faltante") · importación de
CSV/Excel · deduplicación automática.

**FASE 3 — Inteligencia / IA (6–8 semanas)**
Presupuestos con pacing · Web Push + centro de notificaciones · detección de
anomalías · detector de suscripciones y aumentos · categorización semántica con
pgvector · coach de metas de ahorro · split de ticket por renglones.

**FASE 4 — Diferenciación (8–12 semanas)**
Cuentas y tarjetas con saldo real · `merchant` normalizado y timeline de comercio
· radar de suscripciones · liberación de cuotas · chat con capacidad de acción ·
offline-first + voz + share target · undo universal.

**FASE 5 — Innovación 10X (trimestre siguiente)**
Cierre de mes automático · bandeja como pantalla principal · cuentas compartidas
· ingesta por mail · inflación personal · agregación bancaria.

---

### Una nota final, sin complacencia

La calidad técnica de este repo está bastante por encima de la ambición de
producto que expresa. Hay un índice parcial único para impedir que una
transacción sea contraparte de dos movimientos bancarios; hay un parser de
expresiones escrito a mano para no usar `new Function()`; hay una frontera de
validación seria para las respuestas del modelo; hay un motor de scoring de tres
señales con veredicto de IA solo en los casos dudosos. Ese nivel de criterio, en
un producto que todavía no le avisa nada al usuario y no tiene un buscador, está
mal asignado.

**El cuello de botella no es la ingeniería. Es decidir que el software trabaje
para el usuario en vez de esperarlo.**
