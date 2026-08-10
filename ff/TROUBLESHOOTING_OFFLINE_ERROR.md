# Guía de Resolución: Error "Sin Conexión" en Análisis IA

**Problema:** El usuario ve "Sin conexión" cuando intenta usar análisis con IA, pero el internet funciona correctamente.

**Causa Raíz Probable:** Las funciones Edge de Supabase no están desplegadas O faltan las claves API configuradas.

---

## 🔍 Diagnóstico Rápido

Abre la consola del navegador (F12) y ejecuta:

```javascript
// Intenta conectar con la función de insights
fetch('https://YOUR_SUPABASE_URL/functions/v1/ai-insights', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_SUPABASE_ANON_KEY'
  },
  body: JSON.stringify({ month: '2026-08' })
})
.then(r => r.json())
.then(console.log)
.catch(e => console.error('Error:', e.message))
```

**Resultados esperados:**
- ✅ `{ error: 'unauthorized' }` → Supabase OK, pero token inválido
- ✅ `{ error: 'no_data', ... }` → ¡TODO FUNCIONA! No hay datos este mes
- ❌ `Failed to fetch` → Función no desplegada o CORS error
- ❌ `TypeError: Invalid URL` → .env no está configurado

---

## 🛠️ Resolución Paso a Paso

### Paso 1: Verificar Configuración de Variables de Entorno

**Archivo:** `ff/.env` (crear si no existe)

```bash
# Debe tener exactamente esto:
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
VITE_DEMO_MODE=false
```

**Cómo obtenerlas:**
1. Ve a [Supabase Dashboard](https://app.supabase.com)
2. Proyecto → Settings → API
3. Copia `Project URL` y `anon` key
4. Pega en `.env`

**Verificación:**
```bash
cd ff
grep VITE_ .env
# Debe mostrar las 3 variables
```

---

### Paso 2: Verificar que Edge Functions Existen

```bash
cd ff

# Chequea si las functions están desplegadas
supabase functions list

# Debe mostrar:
# ✓ analyze-receipt
# ✓ ai-insights
# ✓ ai-chat
```

**Si NO aparecen, deployar:**
```bash
supabase functions deploy analyze-receipt
supabase functions deploy ai-insights
supabase functions deploy ai-chat

# Esperar 5-10 segundos a que se propague
```

---

### Paso 3: Verificar Secrets de IA en Supabase

```bash
# Ver qué secrets están configurados
supabase secrets list

# Debe mostrar al menos:
# AI_PROVIDER
# GEMINI_API_KEY (si usas Gemini) o OPENAI_API_KEY, etc.
```

**Si están vacíos, configurar (ejemplo con Gemini gratis):**

#### Opción A: Usar Gemini (recomendado, gratis)
```bash
# 1. Crear API key en https://ai.google.dev/
# 2. Configurar en Supabase:
supabase secrets set \
  AI_PROVIDER=gemini \
  GEMINI_API_KEY="AIzaSy..." \
  AI_DAILY_LIMIT=25

# Reemplaza AIzaSy... con tu clave real
```

#### Opción B: Usar OpenAI
```bash
supabase secrets set \
  AI_PROVIDER=openai \
  OPENAI_API_KEY="sk-..." \
  AI_DAILY_LIMIT=25
```

#### Opción C: Usar Anthropic (Claude)
```bash
supabase secrets set \
  AI_PROVIDER=anthropic \
  ANTHROPIC_API_KEY="sk-ant-..." \
  AI_DAILY_LIMIT=25
```

#### Opción D: Usar Groq
```bash
supabase secrets set \
  AI_PROVIDER=groq \
  GROQ_API_KEY="gsk_..." \
  AI_DAILY_LIMIT=25
```

---

### Paso 4: Validar que los Secrets se Aplicaron

```bash
# Ver los secrets (sin valores sensibles)
supabase secrets list

# Debe mostrar:
# AI_PROVIDER ••••••••
# GEMINI_API_KEY ••••••••
# AI_DAILY_LIMIT ••••••••
```

**Nota:** Si cambias secrets, las funciones pueden tardar 30-60 segundos en recargar.

---

### Paso 5: Chequear Logs de Edge Functions

```bash
# Ver si hay errores en las functions
supabase functions logs analyze-receipt --limit 50
supabase functions logs ai-insights --limit 50
supabase functions logs ai-chat --limit 50

# Si ves errores como:
# "GEMINI_API_KEY is not set" → Falta configurar secrets
# "400 Bad Request" → Clave API inválida
```

---

### Paso 6: Test Manual de Conexión

Abre terminal y ejecuta:

```bash
# Reemplaza con tus valores reales
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJh..."
export BEARER_TOKEN="eyJh..."  # Mismo que ANON_KEY para demo

curl -X POST "$SUPABASE_URL/functions/v1/ai-insights" \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"month":"2026-08"}'

# Resultado esperado:
# {"error":"no_data"}  ← Significa que está funcionando, solo no hay datos
# {"error":"unauthorized"}  ← Token inválido, verifica ANON_KEY
# (error en la terminal)  ← Función no existe o CORS error
```

---

## 🚨 Errores Comunes y Soluciones

### Error: "Failed to fetch" en consola del navegador

**Causas:**
1. Function no desplegada
2. URL de Supabase incorrecta en .env
3. CORS bloqueado (muy raro en Supabase)

**Solución:**
```bash
# 1. Verificar .env
cat ff/.env | grep VITE_SUPABASE_URL

# 2. Verificar que URL es válida (xxxxx.supabase.co)

# 3. Verificar functions desplegadas
supabase functions list
```

### Error: "GEMINI_API_KEY is not set"

**Causa:** Secrets no configurados en Supabase

**Solución:**
```bash
supabase secrets list
# Si sale vacío, ejecutar:
supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY="AIzaSy..."
```

### Error: "Invalid API key"

**Causa:** Clave API expirada o incorrecta

**Solución:**
1. Ir a [Google AI Studio](https://ai.google.dev/)
2. Generar nueva clave
3. Actualizar en Supabase:
```bash
supabase secrets set GEMINI_API_KEY="AIzaSy_NUEVA..."
```

### Error: "daily_limit_reached"

**Causa:** Usuario alcanzó el límite diario (25 análisis por defecto)

**Solución:**
1. Esperar hasta mañana
2. O aumentar el límite:
```bash
supabase secrets set AI_DAILY_LIMIT=100
```

---

## ✅ Checklist de Resolución

- [ ] `.env` tiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- [ ] `supabase functions list` muestra `analyze-receipt`, `ai-insights`, `ai-chat`
- [ ] `supabase secrets list` muestra `AI_PROVIDER` y clave API
- [ ] Test curl devuelve algo JSON (no error de fetch)
- [ ] Esperar 1 minuto después de cambiar secrets
- [ ] Recargar navegador (Ctrl+Shift+R hard refresh)
- [ ] Intentar análisis en UI

---

## 🔗 Referencias

- [Supabase Docs: Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Docs: Secrets Management](https://supabase.com/docs/guides/functions/secrets)
- [Google AI API Keys](https://ai.google.dev/)
- [Groq Console](https://console.groq.com)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Anthropic API Keys](https://console.anthropic.com/account/keys)

---

## 📞 Si Sigue Sin Funcionar

1. **Recolectar información:**
   ```bash
   # En la carpeta ff/:
   supabase functions list > functions.txt
   supabase secrets list > secrets.txt
   supabase functions logs ai-insights --limit 20 > logs.txt
   cat .env > env.txt (OJO: quita claves antes de compartir!)
   ```

2. **Compartir logs:**
   - Resultado de `supabase functions list`
   - Resultado de `supabase functions logs ai-insights --limit 20`
   - El error exacto que ves en UI o en consola del navegador
   - NOclaves de API, solo confirmar "está configurada" o "no"

---

**Última actualización:** 2026-08-10  
**Versión:** 1.0
