#!/bin/bash

# Script de Diagnóstico del Sistema IA - Flow Finance
# Uso: bash AI_SYSTEM_DIAGNOSIS.sh

set -e

echo "════════════════════════════════════════════════════════════════"
echo "🔍 DIAGNÓSTICO SISTEMA IA - FLOW FINANCE"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

# 1. Verificar CLI de Supabase
echo ""
echo "1️⃣  Verificando Supabase CLI..."
if command -v supabase &> /dev/null; then
    pass "Supabase CLI instalado"
    supabase --version
else
    fail "Supabase CLI NO está instalado"
    echo "   Instalar con: npm install -g supabase"
    exit 1
fi

# 2. Verificar .env
echo ""
echo "2️⃣  Verificando archivo .env..."
if [ -f "ff/.env" ]; then
    pass ".env existe"
    if grep -q "VITE_SUPABASE_URL" ff/.env; then
        pass "VITE_SUPABASE_URL configurado"
    else
        fail "VITE_SUPABASE_URL falta en .env"
    fi
    if grep -q "VITE_SUPABASE_ANON_KEY" ff/.env; then
        pass "VITE_SUPABASE_ANON_KEY configurado"
    else
        fail "VITE_SUPABASE_ANON_KEY falta en .env"
    fi
else
    fail ".env NO existe"
    echo "   Crear desde .env.example: cp ff/.env.example ff/.env"
fi

# 3. Verificar Edge Functions
echo ""
echo "3️⃣  Verificando Edge Functions desplegadas..."
FUNCTIONS=$(supabase functions list 2>/dev/null || echo "ERROR")

if [[ "$FUNCTIONS" == "ERROR" ]]; then
    fail "No se pudo conectar a Supabase"
    echo "   Verifica: supabase login && supabase projects list"
else
    # Buscar las 3 functions requeridas
    for func in "analyze-receipt" "ai-insights" "ai-chat"; do
        if echo "$FUNCTIONS" | grep -q "$func"; then
            pass "Function '$func' desplegada"
        else
            fail "Function '$func' NO está desplegada"
        fi
    done
fi

# 4. Verificar Secrets
echo ""
echo "4️⃣  Verificando secrets de IA en Supabase..."
SECRETS=$(supabase secrets list 2>/dev/null || echo "ERROR")

if [[ "$SECRETS" == "ERROR" ]]; then
    fail "No se pudo acceder a secrets"
else
    # Verificar secrets principales
    if echo "$SECRETS" | grep -q "AI_PROVIDER"; then
        pass "AI_PROVIDER configurado"
    else
        warn "AI_PROVIDER no encontrado"
    fi

    # Chequear al menos una clave API
    has_api_key=false
    for key in "GEMINI_API_KEY" "OPENAI_API_KEY" "ANTHROPIC_API_KEY" "GROQ_API_KEY"; do
        if echo "$SECRETS" | grep -q "$key"; then
            pass "$key configurado"
            has_api_key=true
            break
        fi
    done

    if [ "$has_api_key" = false ]; then
        fail "Ninguna clave API de IA encontrada (GEMINI/OPENAI/ANTHROPIC/GROQ)"
    fi

    if echo "$SECRETS" | grep -q "AI_DAILY_LIMIT"; then
        pass "AI_DAILY_LIMIT configurado"
    else
        warn "AI_DAILY_LIMIT no encontrado (usa default: 25)"
    fi
fi

# 5. Verificar archivos de configuración
echo ""
echo "5️⃣  Verificando archivos de configuración local..."
if [ -f "ff/supabase/functions/deno.json" ]; then
    pass "deno.json encontrado"
else
    warn "deno.json no encontrado en supabase/functions/"
fi

# 6. Verificar archivos source de IA
echo ""
echo "6️⃣  Verificando archivos source de IA..."
REQUIRED_FILES=(
    "ff/supabase/functions/_shared/ai.ts"
    "ff/supabase/functions/ai-insights/index.ts"
    "ff/supabase/functions/ai-chat/index.ts"
    "ff/supabase/functions/analyze-receipt/index.ts"
    "ff/src/services/ai/supabaseAi.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        pass "$file existe"
    else
        fail "$file NO EXISTE"
    fi
done

# 7. Test de conectividad básico
echo ""
echo "7️⃣  Test de conectividad..."

# Extraer URL del .env
SUPABASE_URL=$(grep "VITE_SUPABASE_URL" ff/.env 2>/dev/null | cut -d'=' -f2)

if [ -z "$SUPABASE_URL" ]; then
    fail "No se pudo leer VITE_SUPABASE_URL"
else
    info "Probando conectividad a $SUPABASE_URL"

    # Test simple: intentar llegar al health check de Supabase
    if curl -s -o /dev/null -w "%{http_code}" "https://${SUPABASE_URL#https://}/functions/v1/" | grep -q "40[1-3]"; then
        pass "Supabase endpoint accesible"
    else
        warn "No se puede alcanzar Supabase directamente (podría ser CORS/firewall)"
    fi
fi

# 8. Resumen
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 RESUMEN DE DIAGNÓSTICO"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Pasos para resolver 'Sin conexión':"
echo ""
echo "Si faltan Edge Functions:"
echo "  $ cd ff"
echo "  $ supabase functions deploy analyze-receipt"
echo "  $ supabase functions deploy ai-insights"
echo "  $ supabase functions deploy ai-chat"
echo ""
echo "Si faltan secrets:"
echo "  $ supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY='AIzaSy...'"
echo "  $ supabase secrets set AI_DAILY_LIMIT=25"
echo ""
echo "Si falta .env:"
echo "  $ cp ff/.env.example ff/.env"
echo "  $ # Editar con valores reales de Supabase Dashboard"
echo ""
echo "Para ver logs de una function:"
echo "  $ supabase functions logs ai-insights --limit 20"
echo ""
echo "════════════════════════════════════════════════════════════════"
