#!/bin/bash
# Extrator de encartes usando OpenClaw Vision (Haiku)
# Uso: ./extrair_encartes.sh

set -e

SCRIPT_DIR="$(dirname "$0")"
TEMP_DIR="/tmp/encartes"
OFERTAS_FILE="$SCRIPT_DIR/../lista-mercado/ofertas.json"

echo "🛒 Extraindo encartes..."

# Cria diretórios
mkdir -p "$TEMP_DIR/condor" "$TEMP_DIR/muffato"

# Função para baixar páginas
download_pages() {
    local slug=$1
    local dir=$2
    
    echo "📥 Baixando $slug..."
    
    # Pega URLs das páginas
    curl -s "https://www.tiendeo.com.br/ponta-grossa/$slug" \
        -H "User-Agent: Mozilla/5.0" | \
        grep -oE 'page_assets/[0-9]+/[0-9]+/page_[0-9]+_level_2_[0-9]+\.webp' | \
        sort -u | head -8 | while read path; do
            page=$(echo "$path" | grep -oE '/[0-9]+/page' | grep -oE '[0-9]+')
            url="https://pt-br-media-publications.shopfully.cloud/publications/$path"
            curl -s "$url" -o "$dir/page_${page}.webp"
            convert "$dir/page_${page}.webp" "$dir/page_${page}.png" 2>/dev/null
            echo "  Página $page ✓"
        done
}

# Baixa páginas
download_pages "supermercados-condor" "$TEMP_DIR/condor"
download_pages "super-muffato" "$TEMP_DIR/muffato"

echo "✓ Páginas baixadas. Use OpenClaw Vision para extrair produtos."
echo "Imagens em: $TEMP_DIR"

# Limpeza automática após 1 hora (cron vai processar antes)
(sleep 3600 && rm -rf "$TEMP_DIR" 2>/dev/null) &
