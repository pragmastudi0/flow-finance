# Auditoría — flujo de creación de categorías

**Fecha:** 22/08/2026 · **Alcance:** `ff/src/pages/CategoriesPage.tsx`, `ff/src/hooks/useCategories.ts`,
`ff/src/components/ui/dialog.tsx`, y los consumidores de categorías (parser, selectores, gráficos).

## Resumen

El flujo tiene **dos fallas que lo rompen de punta a punta** y una tercera que lo deja sin sentido:

1. **El diálogo no entra en la pantalla y no scrollea.** En un teléfono de 667px de alto (iPhone SE)
   el botón *Agregar* queda fuera del viewport y **no hay forma de tocarlo**: no se puede crear
   una categoría. En todos los tamaños probados el título y la X de cerrar quedan recortados arriba
   y *Cancelar* queda fuera abajo.
2. **Todo error del servidor se traga en silencio.** Nombre repetido, nombre largo o sin red: el
   diálogo se queda abierto, no aparece ningún mensaje y la promesa queda sin capturar. Para el
   usuario el botón simplemente "no hace nada".
3. **Lo que se crea no se puede usar.** Las categorías propias no aparecen en ningún selector, el
   parser nunca las asigna y los gráficos/listados las muestran con ícono y color genéricos.

## Cómo lo probé

Levanté la app con Vite y la manejé con Playwright sobre Chromium, en dos configuraciones:

- **Modo demo** (sin credenciales de Supabase, persistencia en `localStorage`) — para el flujo feliz,
  las validaciones de UI y el recorrido posterior (cargar un movimiento, editarlo).
- **Modo producción simulado** — apunté `VITE_SUPABASE_URL` a un servidor HTTP propio que imita el
  REST de Supabase y devuelve los errores reales de la base: `23505` (índice único
  `categories_unique_name`), `23514` (check `length(trim(name)) between 1 and 40`) y caída de red.
  Es la única manera de ejercitar los caminos de error, porque el modo demo no valida nada.

Viewports medidos: 375×667, 390×844, 393×851, 430×932 y 1280×800.
La suite existente (`npm test`) pasa: 55/55 — **ninguno de esos tests toca este flujo**.

---

## Hallazgos

### B-1 · CRÍTICO — El diálogo desborda la pantalla y no se puede scrollear

`DialogContent` (`ff/src/components/ui/dialog.tsx:35`) se posiciona `fixed top-[50%] translate-y-[-50%]`
**sin `max-h` ni `overflow-y-auto`**. El contenido del diálogo de categorías mide entre 986 y 1084px
(65 emojis + 11 colores + tipo + nombre + footer). Como Radix bloquea el scroll del body
(`document.body { overflow: hidden }`) y el diálogo es `fixed`, **nada scrollea**: lo que queda fuera
del viewport es inalcanzable.

Medición (`role=dialog` y botón *Agregar*):

| Viewport | y del diálogo | alto | y de *Agregar* | ¿Agregar tocable? | ¿Cancelar visible? | ¿Título visible? |
|---|---|---|---|---|---|---|
| 375×667 (iPhone SE) | −208 | 1084 | 755 | **NO** | no | no |
| 390×844 (iPhone 12/13) | −96 | 1036 | 819 | parcial (recortado) | no | no |
| 393×851 (Pixel 5) | −92 | 1036 | 823 | parcial | no | no |
| 430×932 (iPhone 14 Pro Max) | −28 | 988 | 839 | sí | no | no |
| 1280×800 (desktop) | −46 | 892 | 773 | parcial | no | no |

En 375×667 el intento de click falla por timeout, y ni la rueda del mouse ni el gesto táctil mueven
nada (`document.scrollingElement.scrollTop` sigue en 0).

**Es casi con seguridad el problema que motivó el reporte.** Además, el usuario ve un diálogo sin
encabezado que arranca con el campo *Nombre* cortado y una pared de 65 emojis.

Alcance: el defecto está en el componente compartido, así que afecta a los tres diálogos de la app.
`FixedExpenses` también desborda (736px en 667px); `Savings` entra por poco (476px). Para contraste,
`bottom-sheet.tsx:94` y `sheet.tsx:35` sí traen `max-h-[90dvh] overflow-y-auto` / `max-h-[85dvh]`:
`dialog.tsx` es el único que quedó sin ese tratamiento.

### B-2 · CRÍTICO — Los errores del backend se tragan; el diálogo queda colgado

`handleCreate` (`ff/src/pages/CategoriesPage.tsx:54`) hace `await createCategory.mutateAsync(...)`
sin `try/catch`, y `useCreateCategory` (`ff/src/hooks/useCategories.ts:25`) no define `onError`.
Cuando la mutación rechaza, el `await` corta la función: no se muestra toast, no se cierra el diálogo,
no se limpia nada, y queda una *unhandled promise rejection*.

Reproducido contra el backend simulado:

| Caso | Respuesta | Toast | Diálogo | Consola |
|---|---|---|---|---|
| Nombre duplicado (`MASCOTAS` con `Mascotas` existente) | 409 `23505` | **ninguno** | queda abierto | unhandled rejection |
| Nombre de 60 caracteres | 400 `23514` | **ninguno** | queda abierto | unhandled rejection |
| Sin conexión | red caída | **ninguno** | queda abierto | — |

Desde la vista del usuario: apretás *Agregar*, el botón deja de girar y no pasa absolutamente nada.
No hay forma de saber que el nombre ya existía.

`handleDelete` tiene exactamente el mismo problema.

### B-3 · ALTO — La categoría creada no se puede usar en ninguna parte

`useUserCategories` se importa en **un solo archivo**: `CategoriesPage.tsx`. Todo el resto de la app
trabaja con las constantes de `domain/categories.ts`:

- `EditTransactionSheet.tsx:124` y `DocumentAnalysisSheet.tsx:155` arman el selector con
  `categoriesFor(type)` → solo las 15 categorías built-in.
- `parser.ts:167` recorre `categoriesFor(type)` → el parser **nunca** puede clasificar en una
  categoría propia, ni siquiera con `flowfinance_category_learnings`.
- `TransactionRow.tsx:107`, `Reports.tsx:191` y `PendingTransactionCard.tsx:31` resuelven el ícono con
  `CATEGORY_ICONS[tx.category]` → cae al 💰 genérico.
- `CategoryChart.tsx:84` resuelve el color con `CATEGORY_COLORS[entry.name]` → cae al gris.

Verificado en el navegador: creé "Mascotas", cargué *"3000 comida para el perro"* y la app lo
clasificó como **Comida**; al editar el movimiento, el selector de categoría no lista "Mascotas".
El ícono y el color que el usuario eligió con tanto cuidado solo se ven en la pantalla de Categorías.

### B-4 · MEDIO — Se puede duplicar el nombre de una categoría built-in

El índice único `categories_unique_name` es `(user_id, type, lower(name))` y solo cubre las categorías
del usuario. No hay ningún chequeo contra los nombres built-in. Creé "Comida" y la lista pasó a
mostrar **"Comida" dos veces** (la built-in y la propia), siendo la segunda inservible por B-3.

### B-5 · MEDIO — El modo demo no valida unicidad: comportamiento divergente

`demoCategories.insert` (`ff/src/lib/demo.ts:112`) escribe sin chequear nada. Creé "Mascotas" dos veces
y quedaron **dos filas idénticas**, ambas con toast de éxito. En producción el mismo caso falla en
silencio (B-2). El modo demo, que es donde se prueba y se demuestra la app, oculta el bug.

### B-6 · MEDIO — Los mensajes no dicen nada (i18n mal aplicada)

| Situación | Código | Lo que se lee |
|---|---|---|
| Nombre vacío | `toast.error(t('name') + ' ' + t('save'))` | **"Nombre Guardar"** |
| Categoría creada | `toast.success(t('save'))` | **"Guardar"** |
| Categoría borrada | `toast.success(t('delete'))` | **"Eliminar"** |

Son etiquetas de botón usadas como mensajes. El diccionario no tiene claves para esto
(`categoryCreated`, `categoryDeleted`, `nameRequired`, `categoryAlreadyExists`).

### B-7 · MEDIO — El campo de nombre no limita a 40 caracteres

La columna tiene `check (length(trim(name)) between 1 and 40)` pero el `Input` no tiene `maxLength`
ni validación previa. Escribir 41 caracteres produce un `23514` que, por B-2, no se ve.

### B-8 · MENOR — No hay `<form>`: Enter no envía

Los campos están sueltos en un `div`. Verificado: con el nombre escrito, Enter no dispara nada.
En mobile eso significa que el teclado muestra "listo" y no pasa nada.

### B-9 · MENOR — Borrar es inmediato, sin confirmación ni deshacer

Un toque en el tacho borra la categoría al instante. No hay confirmación ni *undo* — a diferencia del
borrado de transacciones, que sí lo tiene (ver el comentario del `Toaster` en `App.tsx:168`).
Además `flowfinance_transactions.category` es texto libre sin FK: borrar una categoría deja
huérfanos los movimientos que la usaban, sin aviso.

### B-10 · MENOR — Después de crear, no se ve el resultado

La sección "Tus categorías" va después de las 15 built-in, fuera de la vista. Al cerrarse el diálogo
el usuario queda arriba de todo, con un toast que dice "Guardar" (B-6). No hay ninguna señal de que
la categoría se haya creado sin scrollear hasta el fondo.

### B-11 · MENOR — Sin estado de carga

`const { data: userCategories = [] } = useUserCategories()` ignora `isLoading`, así que mientras
carga se muestra el cartel "No creaste categorías personalizadas todavía", que después desaparece.

### B-12 · MENOR — Accesibilidad

Los `<label>` no están asociados a los inputs (sin `htmlFor`/`id`), el `DialogContent` no tiene
`DialogDescription` y el `aria-label` de los colores es el nombre en inglés (`"green"`, `"slate"`)
aunque la interfaz esté en español.

### B-13 · MENOR — Defaults inconsistentes entre app y base

La app guarda hex (`#64748b`, `💰`); la tabla tiene `color text not null default 'slate'` (token) e
`icon default '📝'`. La columna `color` puede terminar con dos formatos distintos según quién escriba,
y `toCategory` (`mappers.ts:92`) tapa el problema con un fallback a hex.

---

## Recomendaciones, por orden

1. **`dialog.tsx`**: agregar `max-h-[85dvh] overflow-y-auto` (y `top-[50%]` con `translate` está bien
   una vez que hay tope de alto) al `DialogContent`. Arregla B-1 en los tres diálogos de una.
   Mejor todavía para este caso: usar el `BottomSheet` que ya usa el resto de la app en mobile.
2. **Manejo de errores**: `try/catch` en `handleCreate`/`handleDelete` (o `onError` en las mutaciones)
   con mensajes por código: `23505` → "Ya tenés una categoría con ese nombre", `23514` → "El nombre
   no puede superar los 40 caracteres", red → mensaje de conexión. Mantener el diálogo abierto
   solo con el error visible.
3. **Cerrar el círculo (B-3)**: que `EditTransactionSheet`, `DocumentAnalysisSheet` y el resolutor de
   ícono/color lean también `useUserCategories`, y que el parser sume las categorías propias a sus
   candidatas. Sin esto, crear categorías no le sirve de nada al usuario.
4. **Validación previa al submit**: trim, `maxLength={40}`, y chequeo contra las built-in y las propias
   ya cargadas, con el error debajo del campo en vez de un toast.
5. **Mensajes propios en el diccionario** (B-6) y `<form onSubmit>` para que Enter funcione (B-8).
6. **Igualar el modo demo a producción** (B-5): rechazar duplicados en `demoCategories.insert`.
7. **Confirmación + undo al borrar** (B-9) y decidir qué pasa con los movimientos que quedan huérfanos.
8. **Tests**: hoy no hay ninguno sobre este flujo. Como mínimo, cubrir la validación de nombre y el
   mapeo de errores de la mutación.
