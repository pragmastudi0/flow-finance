# Migrar los datos de la app anterior

La app corría sobre una plataforma no-code con un modelo de datos propio. Estos
son los cambios de nombre y forma que tiene que hacer el script de importación.

## Renombres

| Campo original | Campo nuevo | Nota |
|---|---|---|
| `Transaction.date` | `transactions.occurred_on` | |
| `Transaction.raw_input` | `transactions.raw_input` | sin cambios |
| — | `transactions.currency`, `fx_rate` | nuevos: default `'ARS'` / `1` |
| `FixedExpense.recurrenceType` | `fixed_expenses.recurrence` | |
| `FixedExpense.startDate` | `fixed_expenses.start_date` | |
| `FixedExpense.remainingInstallments` | `fixed_expenses.remaining_installments` | |
| `FixedExpense.cancellationDate` | `fixed_expenses.cancelled_on` | |
| `SavingsGoal.goalAmount` | `savings_goals.goal_amount` | |
| `SavingsGoal.targetDate` | `savings_goals.target_date` | |
| `SavingsGoal.currentSavedAmount` | — | pasa a ser una fila de `savings_contributions` |
| `ExchangeRateHistory.datetime` | `exchange_rate_history.captured_at` | |
| `created_by` (email) | `user_id` (uuid) | |

## Lo que puede morder

**`created_by` → `user_id`.** El sistema anterior identificaba al dueño por email;
Postgres usa el uuid de `auth.users`. Hay que crear los usuarios en Supabase Auth
**antes** de importar y armar una tabla de correspondencia email → uuid. Si
importás con el email, las políticas de RLS rechazan todo.

**`currentSavedAmount` no tiene columna equivalente.** Por cada objetivo con
progreso, insertá una sola fila en `savings_contributions` con ese monto y la
fecha de creación del objetivo. A partir de ahí el historial se construye solo.

**Las categorías personalizadas se guardaban por nombre.** `transactions.category`
sigue siendo texto libre, así que se importa tal cual — pero conviene normalizar
mayúsculas y espacios antes, o vas a terminar con "Super" y "super" como dos
categorías distintas en los reportes.

**El aprendizaje de categorías era global.** Antes no se filtraba por usuario, así
que la tabla puede tener filas de otras personas. Si vas a importarla, quedate
solo con las que puedas atribuir con certeza; si no, arrancá vacío: se vuelve a
aprender solo con el uso.
