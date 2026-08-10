# Auditoría de Análisis con IA - Flow Finance

**Fecha:** 2026-08-10  
**Estado:** Análisis Completo  
**Rama:** `claude/audit-ai-analysis-z2w3dz`

---

## 📋 Resumen Ejecutivo

El sistema de análisis con IA de Flow Finance está **correctamente diseñado pero presenta un problema crítico de configuración**. El usuario recibe un error de "Sin conexión" cuando intenta usar funciones de IA, pero la arquitectura está bien implementada.

### Hallazgo Crítico
⚠️ **Las funciones Supabase Edge no están desplegadas O faltan las claves API de configuración en los secrets de Supabase**

---

## 🏗️ Arquitectura del Sistema IA

### 1. Flujo de Análisis de Recibos
```
Usuario carga imagen
    ↓
frontend: analyzeDocument() → upload a storage
    ↓
Invoca edge function: analyze-receipt
    ↓
Edge function (Gemini/Groq vision)
    ↓
Parsea JSON → guarda en BD → devuelve al usuario
```

**Archivos clave:**
- `supabase/functions/analyze-receipt/index.ts` - Función principal
- `src/lib/receipts.ts` - Cliente que invoca
- `supabase/functions/_shared/ai.ts` - Provider agnóstico

### 2. Flujo de Reportes IA (Insights)
```
Usuario abre pestaña "AI Insights" para mes específico
    ↓
frontend: getReport() → invoca ai-insights
    ↓
Edge function construye snapshot de BD
    ↓
Envía a modelo (Gemini/Groq/OpenAI/Anthropic)
    ↓
Cachea resultado en BD
    ↓
Devuelve a usuario
```

**Archivos clave:**
- `supabase/functions/ai-insights/index.ts` - Genera reportes
- `src/services/ai/supabaseAi.ts` - Cliente de IA
- `supabase/functions/_shared/finance.ts` - Construcción de snapshot
- `supabase/functions/_shared/report.ts` - Parsing de reportes

### 3. Flujo de Chat IA
```
Usuario pregunta sobre sus finanzas
    ↓
Construye snapshot del mes
    ↓
Envía a modelo con contexto
    ↓
Devuelve respuesta
```

**Archivos clave:**
- `supabase/functions/ai-chat/index.ts` - Asistente financiero
- `src/services/ai/supabaseAi.ts` - Ask method

---

## 🔍 Análisis Detallado

### Gestión de Proveedores IA

**Archivo:** `supabase/functions/_shared/ai.ts`

El sistema soporta **4 proveedores:**
1. **Gemini** (Google) - `gemini-2.5-flash` (modelo por defecto)
2. **Groq** (Meta Llama) - `meta-llama/llama-4-scout-17b-16e-instruct`
3. **OpenAI** - `gpt-4o-mini`
4. **Anthropic** - `claude-haiku-4-5-20251001`

**Flujo de selección de proveedor:**
```typescript
1. Si usuario configuró clave en settings → usa esa + proveedor elegido
2. Si no → usa env secret: AI_PROVIDER (default: gemini)
3. Modelo: env secret AI_MODEL → default según proveedor
```

**Puntos débiles identificados:**

❌ **Problema 1: Sin validación de API keys en runtime**
- Línea 41 en ai.ts: `if (!value) throw new Error()`
- Si falta una clave API, error es genérico: "GEMINI_API_KEY is not set"
- No hay fallback a otro proveedor
- No hay logging de qué proveedor/modelo se usa

❌ **Problema 2: Manejo de errores de red poco descriptivo**
- Línea 66, 98, 136 en ai.ts: Errores de fetch solo devuelven status + primeros 300 chars
- Los errores CORS o SSL se ven como "network error"
- No hay retry automático

---

### Análisis de Recibos (Vision)

**Archivo:** `supabase/functions/analyze-receipt/index.ts`

**Problemas encontrados:**

❌ **Problema 3: Dos implementaciones paralelas de vision**
- Línea 243: `const analyze = PROVIDER === 'groq' ? callGroq : callGemini;`
- Solo soporta Gemini y Groq para vision
- OpenAI y Anthropic no soportan vision (pero se cargan igual)
- **Línea 160-167:** Configuración duplicada de PROVIDER y MODEL vs `ai.ts`

❌ **Problema 4: Limite diario hardcodeado pero poco visible**
- Línea 159: `const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 25);`
- Usuario no sabe cuál es su límite diario
- No hay tracking visual del uso
- Retorna HTTP 429 con límite en body, pero UI no lo interpreta bien

❌ **Problema 5: Almacenamiento de respuestas inseguro**
- Línea 332: `provider: PROVIDER` se guarda en BD
- Línea 333: `model: MODEL` se guarda en BD
- **Riesgo:** Si cambias de proveedor, reportes viejos muestran info incorrecta
- Mejor: Devolver metadata de cada modelo

---

### Reportes de IA (AI Insights)

**Archivo:** `supabase/functions/ai-insights/index.ts`

**Problemas encontrados:**

❌ **Problema 6: Cache sin versión**
- Línea 60-74: Cachea respuestas por usuario + mes
- Sin control de versión de formato
- Si cambias schema de reporte, reportes viejos se sirven con formato antiguo
- Solución: Agregar `cache_version` a schema

❌ **Problema 7: "ai_failed" es demasiado genérico**
- Línea 103: `catch (e) { return json({ error: 'ai_failed' }, 502); }`
- Usuario no sabe si:
  - Falló por falta de datos
  - Falló por timeout del modelo
  - Falló por credenciales inválidas
  - Falló por sobrecarga del API

❌ **Problema 8: No hay timeout explícito**
- Línea 95: Fetch a modelo sin timeout
- Si API es lenta, usuario espera indefinidamente
- Recomendación: Agregar `AbortSignal` con timeout de 30s

---

### Chat de IA

**Archivo:** `supabase/functions/ai-chat/index.ts`

**Problemas encontrados:**

❌ **Problema 9: Historial en cliente vs servidor**
- Línea 27: `const MAX_HISTORY = 8;` en servidor
- Pero cliente (React) también maneja historial
- **Riesgo:** Inconsistencia si cliente envia más de 8 turnos
- Mejor: Validar en servidor sin confiar en cliente

❌ **Problema 10: Temperatura diferente a Insights**
- Línea 105: `temperature: 0.3` en chat
- Pero analyze-receipt usa `temperature: 0`
- ai-insights no especifica (usa default 0.2)
- **Inconsistencia:** Reportes menos variables que chats

---

### Manejo de Errores en Frontend

**Archivo:** `src/services/ai/supabaseAi.ts`

**Error mapping:**

```typescript
FunctionsHttpError (2xx+)  → ErrorFromBody
FunctionsFetchError        → AiError('offline', message)
FunctionsRelayError        → AiError('offline', message)
```

❌ **Problema 11: Todos los errores de red son "offline"**
- Línea 52: `throw new AiError('offline', error.message)`
- Podría ser:
  - CORS error
  - DNS error
  - Timeout
  - Function no deployed
  - Proxy problem (si está en empresa)
- **Impacto:** Usuario cree que no tiene internet cuando el problema es otro

❌ **Problema 12: Parsing de errores frágil**
- Línea 44: `await error.context.clone().json()`
- Si error no es JSON, cae a `AiError('unknown')`
- Sin logging de qué llegó en el body

---

### Configuración de Claves de Usuario

**Archivo:** `src/components/settings/ApiKeyManager.tsx`

✅ **Positivos:**
- Claves se guardan en `user_metadata.apiKeys`
- No se exponen en localStorage
- UI oculta claves con toggle

❌ **Problema 13: Sin validación de formato**
- Usuario puede pegar claves inválidas
- No hay test real hasta que intente usar
- Mejor: Validar formato con regex al menos

❌ **Problema 14: Sin feedback si clave está activa**
- No hay indicador de "esta clave funciona"
- Usuario no sabe si su configuración es correcta hasta que falla

---

## 🔧 Problemas Críticos

### 1. **Edge Functions No Desplegadas** ⚠️ CRÍTICO

El error "Sin conexión" probablemente significa que las funciones no existen.

**Verificación:**
```bash
# Chequear si están desplegadas
supabase functions list

# Si faltan, deployar:
supabase functions deploy analyze-receipt
supabase functions deploy ai-insights
supabase functions deploy ai-chat
```

### 2. **Secrets de IA No Configurados** ⚠️ CRÍTICO

Las funciones necesitan al menos una clave API.

**Verificación:**
```bash
supabase secrets list
```

**Configurar (ejemplo con Gemini):**
```bash
supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=AIzaSy...
supabase secrets set AI_DAILY_LIMIT=25
```

### 3. **Variables de Entorno Frontend** ⚠️ CRÍTICO

Frontend necesita credenciales de Supabase.

**Archivo:** `.env`
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
VITE_DEMO_MODE=false  # Cambiar si quieres modo demo
```

---

## 🛠️ Recomendaciones de Fixes

### Fix 1: Mejorar Detección de Errores de Conexión
**Archivo:** `src/services/ai/supabaseAi.ts`

```typescript
// Actual (línea 52):
throw new AiError('offline', error.message);

// Mejorado:
if (error.message.includes('CORS')) {
  throw new AiError('offline', 'CORS error: check proxy settings');
}
if (error.message.includes('DNS')) {
  throw new AiError('offline', 'DNS resolution failed');
}
if (error.message.includes('timeout')) {
  throw new AiError('offline', 'Request timeout - model too slow');
}
throw new AiError('offline', error.message);
```

### Fix 2: Agregar Logging de Depuración
**Archivo:** `supabase/functions/_shared/ai.ts`

```typescript
// Línea 49-65 (Gemini):
console.log(`[AI] Using provider: gemini, model: ${model}`);
const res = await fetch(...);
if (!res.ok) {
  const body = await res.text();
  console.error(`[AI] Gemini error: ${res.status}`, body.slice(0, 500));
  throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
}
```

### Fix 3: Validar Claves API en Configuración
**Archivo:** `src/components/settings/ApiKeyManager.tsx`

```typescript
const API_KEY_FORMATS: Record<string, RegExp> = {
  gemini: /^AIza[0-9A-Za-z_-]{35}$/,
  openai: /^sk-[A-Za-z0-9]{48}$/,
  anthropic: /^sk-ant-[A-Za-z0-9]{48}$/,
  groq: /^gsk_[A-Za-z0-9]{32}$/,
};

function validateApiKey(provider: string, key: string): boolean {
  const pattern = API_KEY_FORMATS[provider];
  if (!pattern) return key.length > 20;
  return pattern.test(key);
}

// En el componente:
{invalidKeys[id] && (
  <p className="text-xs text-red-600 mt-1">Invalid format</p>
)}
```

### Fix 4: Agregar Timeout a Fetch
**Archivo:** `supabase/functions/_shared/ai.ts`

```typescript
const FETCH_TIMEOUT = 30000; // 30 segundos

function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  return Promise.race([
    promise,
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms)
    ),
  ]);
}

// Uso en Gemini/Anthropic/OpenAI:
const res = await withTimeout(
  fetch(...),
  FETCH_TIMEOUT
);
```

### Fix 5: Especificar Temperatura Consistentemente
**Archivo:** `supabase/functions/ai-insights/index.ts`

```typescript
// Línea 95-99:
const raw = await provider.complete({
  system: REPORT_SYSTEM_PROMPT,
  prompt: JSON.stringify(snapshot),
  json: true,
  temperature: 0.2, // Hacer explícito
});
```

### Fix 6: Versionar Cache de Reportes
**Archivo:** `supabase/functions/ai-insights/index.ts`

```typescript
const CACHE_VERSION = '1'; // Incrementar si cambias schema

// Línea 60-74:
const cacheKey = `${user.id}:${monthDate}:v${CACHE_VERSION}`;
// O en BD: agregar columna cache_version
```

---

## 📊 Flujo de Depuración Recomendado

Si el usuario sigue viendo "Sin conexión":

1. **Verificar edge functions:**
   ```bash
   cd ff
   supabase functions list
   # Debe mostrar: analyze-receipt, ai-insights, ai-chat
   ```

2. **Verificar secrets:**
   ```bash
   supabase secrets list
   # Debe mostrar: AI_PROVIDER, GEMINI_API_KEY (o similar), SUPABASE_URL, etc
   ```

3. **Verificar .env del cliente:**
   ```bash
   cat ff/.env
   # Debe tener VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
   ```

4. **Chequear logs de function:**
   ```bash
   supabase functions logs analyze-receipt --limit 50
   ```

5. **Test manual de la function:**
   ```bash
   curl -X POST https://xxxxx.supabase.co/functions/v1/ai-insights \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"month":"2026-08"}'
   ```

---

## 🎯 Checklist de Implementación

- [ ] Verificar que edge functions están desplegadas
- [ ] Configurar secrets de IA en Supabase
- [ ] Configurar .env del cliente
- [ ] Implementar mejor detección de errores (Fix 1)
- [ ] Agregar logging (Fix 2)
- [ ] Validar claves API en UI (Fix 3)
- [ ] Agregar timeout (Fix 4)
- [ ] Especificar temperatura (Fix 5)
- [ ] Versionar cache (Fix 6)
- [ ] Agregar tests e2e de análisis

---

## 📈 Próximos Pasos

1. **Immediate:** Desplegar funciones y configurar secrets
2. **Short term:** Implementar los 6 fixes
3. **Medium term:** Agregar telemetría de uso de IA
4. **Long term:** Considerar self-hosted para modelos privados

---

**Documento generado:** 2026-08-10  
**Autor:** Claude Code Audit  
**Estado:** Pendiente revisión e implementación
