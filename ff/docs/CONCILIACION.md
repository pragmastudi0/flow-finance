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

## Falsos positivos

Los pares se puntúan, se ordenan y se asignan de a uno: cuando un movimiento
toma un gasto, los dos quedan bloqueados. Tres Ubers de la misma semana no
pueden reclamar el mismo consumo. Los desempates son, en orden, fecha más
cercana y monto más cercano.

Además:

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
pares que quedaron en la banda 70–89 **y** cuyo `descriptionScore` es bajo:
un par ambiguo por el monto no aprende nada de un modelo de lenguaje.

La respuesta es JSON estructurado y se valida antes de usarse; un veredicto
mal formado se descarta. Una confirmación mueve el score hacia la confianza
del modelo (peso 0,3); un rechazo con confianza ≥0,7 baja el par. El modelo
ajusta un número que ya existía — no decide solo.

Si no hay clave, se acabó la cuota o la app está en modo demo, la
conciliación sigue con el resultado determinístico y lo dice en pantalla.

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
