# Conciliación bancaria

Compara el resumen de la tarjeta contra los gastos que el usuario cargó a
mano. El resumen llega como PDF: no hay API bancaria.

## Flujo

```
PDF  →  texto  →  parser  →  persistencia  →  candidatos  →  scoring
                                                                │
                                              ┌─────────────────┴──────────┐
                                              ↓                            ↓
                                        alta confianza                 ambiguo
                                              ↓                            ↓
                                          sugerencia                  IA (existente)
                                              └─────────────┬──────────────┘
                                                            ↓
                                                  revisión del usuario
                                                            ↓
                                                   conciliación persistida
```

Cada etapa es un módulo aparte y se prueba sola. Nada de esto vive dentro de
un componente React.

| Etapa | Dónde |
|---|---|
| Historial de imports | `src/components/reconciliation/ImportHistory.tsx` |
| PDF → texto | `src/lib/pdfText.ts` (pdf.js, carga diferida) |
| Texto → movimientos | `src/domain/reconciliation/statement.ts` |
| Normalización de descripciones | `src/domain/reconciliation/normalize.ts` |
| Scoring | `src/domain/reconciliation/scoring.ts` |
| Candidatos + asignación | `src/domain/reconciliation/matching.ts` |
| Capa de IA | `src/domain/reconciliation/aiVerdict.ts` + `supabase/functions/reconcile-match/` |
| Persistencia | `src/services/reconciliation.ts` |
| Orquestación | `src/hooks/useReconciliation.ts` |
| UI | `src/pages/Reconciliation.tsx` + `src/components/reconciliation/` |
| Configuración | `src/domain/reconciliation/config.ts` |

## El parser

Escrito contra el resumen Visa real que usa la app, no contra un formato
genérico. El PDF tiene capa de texto, así que no hace falta OCR ni visión.

Lo que el formato obliga a manejar:

- **Secciones.** `Pago anterior y devoluciones`, `Movimientos de …`,
  `Impuestos, intereses y percepciones`, y después `Términos y condiciones`,
  a partir de donde ya nada es un movimiento.
- **Fecha heredada.** La fecha se imprime una vez por día; las filas que
  siguen la omiten.
- **Descripciones que envuelven.** `Qivox colon` / `787039489654686140` /
  `252690 $ 45.990,00` son tres líneas y un solo movimiento. El comprobante
  se lee después de unirlas.
- **Líneas con importe que no son movimientos.** Encabezado de página,
  `Copia fiel de carácter informativo`, `Saldo anterior`, `Su pago en pesos`,
  `Subtotal`, `Total a pagar`, `Mínimo a pagar`.
- **Cuotas.** `3 de 3` sale como `installmentCurrent` / `installmentTotal`.
- **Tipo de movimiento.** Compra, cuota, impuesto, comisión, interés,
  devolución, pago. Los pagos y las devoluciones no se concilian contra
  gastos: mueven plata en el otro sentido.

**Verificación.** Después de extraer, la suma de compras y cuotas en pesos se
compara contra el `Subtotal` que imprime el propio resumen. Contra el archivo
real: 43 movimientos, 0 líneas sin interpretar, subtotal exacto
(`$984.028,72`).

## Scoring

```
matchScore = descriptionScore * 0.50
           + dateScore        * 0.25
           + amountScore      * 0.25
```

Los tres devuelven 0–100 y los pesos, escalones y umbrales están todos en
`config.ts`. Nada aguas abajo hardcodea un número.

- **Descripción.** Se normalizan las dos (`MERPAGO*CARREFOUR 004631` →
  `carrefour`, `UBER *TRIP 45821` → `uber`) y se toma la mejor de dos
  medidas: cobertura de tokens y similitud de bigramas.
- **Fecha.** Escalera: mismo día 100, ±1 90, ±2 78, ±3 62, ±4 50, ±5 38, más
  allá 0. La tarjeta imputa días después de consumir.
- **Monto.** Escalera sobre la diferencia porcentual: ≤2 % 95, ≤5 % 90,
  ≤10 % 85, ≤20 % 80, ≤35 % 60, ≤50 % 35, más allá 0.

Clasificación: **≥90** alta confianza, **70–89** revisar, **<70** sin
coincidencia. Ninguna conciliación se escribe sin que el usuario confirme,
por alto que sea el score.

## Dos rutas hacia una sugerencia

**Ruta A — por descripción.** Las descripciones se parecen y deciden las tres
señales con sus pesos.

**Ruta B — ancla de monto y fecha.** Las descripciones no comparten nada pero
los números coinciden con tolerancia mínima (±1 día, hasta 1 %). Es el caso
real que dejaba la bandeja vacía:

| Movimiento | Gasto | desc | fecha | monto | Ruta A |
|---|---|---|---|---|---|
| `Est servicio alaminos` $40.000 13/08 | `nafta` $40.000 13/08 | 0 | 100 | 100 | **50, y el filtro lo descarta antes** |

El ancla se puntúa renormalizando sobre las dos señales que sí informan y con
techo en 89: `round(89 * (fecha*0,5 + monto*0,5) / 100)`. Mismo día y monto
exacto da 89; ±1 día da 85. **Nunca llega sola a alta confianza** — aparece en
**Recomendados** y la IA es lo que la puede confirmar, porque saber que una
estación de servicio es donde cargás nafta no es comparar strings. Si el
modelo confirma con 0,95: 89 × 0,7 + 95 × 0,3 ≈ 91 → pasa a Coincidencias.

**Las anclas se asignan en una segunda pasada**, sobre lo que la Ruta A dejó
suelto. Un ancla de 89 nunca le roba un movimiento a un par por descripción de
75: comercios compartidos le ganan a aritmética compartida.

## Medio de pago

`flowfinance_transactions.payment_method` (`cash` · `transfer` · `debit` ·
`credit` · `other`, nullable).

Es lo que más precisión aporta, porque el efectivo y las transferencias no
pueden estar en un resumen de crédito. Contra el archivo real: un gasto
`super $45.990 18/08` cargado en efectivo enganchaba como ancla al 89 % con
`Qivox colon $45.990 18/08`. Marcado como efectivo, deja de ser candidato.

- `cash` / `transfer` / `debit` → fuera de los candidatos.
- `credit` → desempata a favor en el orden de asignación.
- `null` → sigue siendo candidato, sin ventaja. Es el valor de **todas** las
  filas anteriores a la columna, y no hay backfill: suponer `credit` metería
  en el historial un dato que el usuario nunca dijo.

Al cargar un gasto, el selector arranca en el último método usado
(`localStorage`, con los accesos envueltos en `try/catch` porque una ventana
privada tira al leer). Al conciliar, un gasto sin método queda marcado como
tarjeta: confirmar el match *es* decir que estuvo en la tarjeta. Un método
elegido por el usuario nunca se pisa, y ningún importe se toca.

## Falsos positivos

Los pares se puntúan, se ordenan y se asignan de a uno: cuando un movimiento
toma un gasto, los dos quedan bloqueados. Tres Ubers de la misma semana no
pueden reclamar el mismo consumo. Los desempates son, en orden, fecha más
cercana y monto más cercano.

Además:

- Los gastos en efectivo, por transferencia o con débito quedan afuera.
- Las monedas nunca se cruzan (un consumo en U$S no matchea un gasto en ARS).
- Los gastos ya conciliados en cualquier import quedan fuera.
- Un índice único parcial en la base impide que dos movimientos apunten a la
  misma transacción, aunque la UI falle.

## La IA

Se reutiliza la infraestructura que ya existe: la misma resolución de
proveedor y de clave del usuario que `_shared/ai.ts`, `claim_ai_call` para la
cuota diaria, y el seam `AiProvider` del cliente, al que se le agregó
`judgeMatches`.

`reconcile-match/index.ts` es **autocontenido a propósito**: un deploy que
sube solo la carpeta de la función resuelve `../_shared/ai.ts` fuera de la
raíz del bundle y falla con `Module not found`. Adentro lleva `_shared/ai.ts`
recortado a completado de texto (sin la mitad de visión, que esta función no
usa) y `_shared/cors.ts`, con el mismo orden de precedencia de claves y el
mismo manejo de `AI_PROVIDER` / `AI_MODEL`. Es el mismo patrón que ya sigue
`analyze-receipt`, que también duplica su parser inline. **Si tocás
`_shared/ai.ts`, tocá también este archivo.**

El motor **no** le manda el resumen al modelo. Le manda, como mucho, doce
pares de dos tipos: los que quedaron en la banda 70–89 **y** cuyo
`descriptionScore` es bajo (un par ambiguo por el monto no aprende nada de un
modelo de lenguaje), y **todas las anclas**, que es el caso para el que la IA
existe. El prompt le dice explícitamente que la app suele traer el rubro y no
el comercio: `nafta` → estación de servicio, `super` → supermercado.

La respuesta es JSON estructurado y se valida antes de usarse; un veredicto
mal formado se descarta. Una confirmación mueve el score hacia la confianza
del modelo (peso 0,3); un rechazo con confianza ≥0,7 baja el par. El modelo
ajusta un número que ya existía — no decide solo.

Si no hay clave, se acabó la cuota o la app está en modo demo, la
conciliación sigue con el resultado determinístico y lo dice en pantalla.

## Persistencia de la conciliación

La conciliación vive en la base, no en el estado de la pantalla, así que salir
a mitad de la revisión no cuesta nada. Lo que faltaba era la puerta de vuelta:

- `ImportHistory` lista los últimos resúmenes con su progreso
  (`loadImportProgress`, una sola query agrupada para toda la lista).
- `useReconciliation.openImport(importId)` reabre uno: carga los movimientos
  guardados y corre el mismo matching. **Sin PDF, sin parseo, sin inserts.**
  Los dos caminos comparten `runMatching`.
- El `meta` del resumen (tarjeta, cierre, líneas sin interpretar, chequeo de
  subtotal) se persiste en la columna `stats` del import, que es lo que
  permite reconstruir la pantalla sin volver a leer el archivo.
- **Conciliados** es un grupo propio, con ambos lados a la vista y Deshacer
  (`undoMatch` vuelve el movimiento a `unmatched`, no a `rejected`: el usuario
  está retirando el vínculo, no diciendo que el par estaba mal). Rehacer la
  bandeja después de un undo corre con la IA apagada — los veredictos no
  cambiaron y una segunda llamada gastaría cuota para no aprender nada.

## Idempotencia

Dos niveles:

1. **Hash del archivo** (SHA-256) en `flowfinance_statement_imports`, único
   por usuario. Subir el mismo PDF dos veces no crea un segundo import.
2. **Fingerprint por movimiento**, único por usuario. Es lo que atrapa el
   solapamiento entre el resumen de agosto y el de septiembre, que el hash
   del archivo no ve. Se construye con la descripción **normalizada**, así
   que si el emisor cambia su propia puntuación el movimiento no se duplica.

## Seguridad

Todo pasa por RLS. Las dos tablas nuevas tienen política de dueño idéntica al
resto del esquema, no hay service role en el cliente, y la edge function de
IA no lee filas en nombre del usuario: recibe descripciones sueltas y
devuelve veredictos.

## Limitaciones conocidas

- El parser está afinado para el formato Visa de este emisor. Otro banco
  probablemente necesite ajustar `SKIP_PREFIXES` y `SECTION_MARKERS`; el
  resto del pipeline no cambia.
- PDFs escaneados no se soportan: se detectan y se avisa. La ruta de visión
  ya existe en `analyze-receipt` si en algún momento se quiere usar.
- Si una fila trae importe en pesos **y** en dólares, se toma el último.
- El plan de cuotas futuras (`Próximas cuotas a vencer`) se ignora: son
  proyecciones, no movimientos.
- Un ancla sin IA disponible se muestra sin verificar. La pantalla lo dice con
  todas las letras («mismo importe, mismo día — pero las descripciones no
  tienen nada en común»), pero es el caso donde más conviene tener la clave
  del modelo configurada.
- El medio de pago solo se elige en el selector; no se deduce del texto que
  escribís.
