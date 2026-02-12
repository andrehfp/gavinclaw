#!/usr/bin/env python3
"""
Extrator de encartes usando Vision API
Analisa imagens de encartes e extrai produtos/preços
"""

import os
import sys
import json
import subprocess
import requests
import re
import base64
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = "/tmp/encartes"
OFERTAS_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), "lista-mercado", "ofertas.json")
PRODUTOS_FILE = os.path.join(SCRIPT_DIR, "produtos_monitorados.json")
LISTA_COMPRAS_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), "lista-mercado", "data.json")

# OpenClaw usa este arquivo para chamar a API de visão
VISION_PROMPT = """Analise esta página de encarte de supermercado brasileiro.
Extraia TODOS os produtos visíveis com seus preços.

Retorne APENAS um JSON válido no formato:
{"produtos": [
  {"nome": "Nome Completo do Produto", "preco": "X.XX", "preco_original": "Y.YY", "unidade": "quantidade/peso"},
]}

Regras:
- preco: preço promocional atual (só números e ponto decimal, ex: "14.99")
- preco_original: preço anterior se visível, senão null
- Seja PRECISO nos valores, leia com atenção
- Inclua marca e peso/volume quando visível"""

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}


def load_produtos_monitorados():
    """Carrega lista de produtos para monitorar"""
    produtos = []
    
    # Lista fixa
    try:
        with open(PRODUTOS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            produtos.extend([p.lower() for p in data.get('produtos', [])])
    except:
        pass
    
    # Lista de compras do app
    try:
        with open(LISTA_COMPRAS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for item in data.get('itens', []):
                if not item.get('checked', False):
                    produtos.append(item['text'].lower())
    except:
        pass
    
    return list(set(produtos))


def get_catalog_pages(store_slug):
    """Busca URLs das páginas do catálogo"""
    url = f"https://www.tiendeo.com.br/ponta-grossa/{store_slug}"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        pages = re.findall(
            r'page_assets/(\d+)/(\d+)/page_\d+_level_2_(\d+)\.webp',
            resp.text
        )
        
        if not pages:
            return []
        
        catalog_id = pages[0][0]
        seen = set()
        result = []
        
        for cat_id, page_num, hash_val in pages:
            if page_num not in seen and cat_id == catalog_id:
                seen.add(page_num)
                result.append({
                    'page': int(page_num),
                    'url': f"https://pt-br-media-publications.shopfully.cloud/publications/page_assets/{catalog_id}/{page_num}/page_{page_num}_level_2_{hash_val}.webp"
                })
        
        return sorted(result, key=lambda x: x['page'])[:8]  # Max 8 páginas
    except Exception as e:
        print(f"Erro ao buscar catálogo: {e}", file=sys.stderr)
        return []


def download_and_convert(url, output_path):
    """Baixa imagem e converte para PNG"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        webp_path = output_path.replace('.png', '.webp')
        
        with open(webp_path, 'wb') as f:
            f.write(resp.content)
        
        subprocess.run(['convert', webp_path, output_path], 
                      capture_output=True, check=True)
        return True
    except Exception as e:
        print(f"Erro download: {e}", file=sys.stderr)
        return False


def extract_with_vision_api(image_path, store_name):
    """
    Usa a API de visão via OpenClaw CLI
    Retorna lista de produtos extraídos
    """
    try:
        # Chama openclaw com a imagem
        result = subprocess.run(
            ['openclaw', 'image', '--prompt', VISION_PROMPT, image_path],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        output = result.stdout
        
        # Extrai JSON da resposta
        json_match = re.search(r'\{[\s\S]*"produtos"[\s\S]*\}', output)
        if json_match:
            data = json.loads(json_match.group())
            return data.get('produtos', [])
        
        return []
    except Exception as e:
        print(f"Erro vision API: {e}", file=sys.stderr)
        return []


def extract_with_tesseract(image_path):
    """Fallback: usa Tesseract OCR"""
    try:
        result = subprocess.run(
            ['tesseract', image_path, 'stdout', '-l', 'por'],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout
    except:
        return ""


def produto_match(nome, monitorados):
    """Verifica se produto está na lista de monitorados"""
    nome_lower = nome.lower()
    for termo in monitorados:
        if termo in nome_lower or nome_lower in termo:
            return True
    return False


def process_store(store_slug, store_name, monitorados):
    """Processa todas as páginas de uma loja"""
    print(f"\n📦 Processando {store_name}...", file=sys.stderr)
    
    pages = get_catalog_pages(store_slug)
    print(f"   {len(pages)} páginas encontradas", file=sys.stderr)
    
    if not pages:
        return [], None
    
    store_dir = os.path.join(TEMP_DIR, store_slug)
    os.makedirs(store_dir, exist_ok=True)
    
    all_products = []
    catalog_link = None
    
    for page in pages:
        png_path = os.path.join(store_dir, f"page_{page['page']}.png")
        
        print(f"   Página {page['page']}...", file=sys.stderr)
        
        if not download_and_convert(page['url'], png_path):
            continue
        
        # Tenta extrair com Tesseract primeiro (mais rápido)
        text = extract_with_tesseract(png_path)
        
        # Verifica se tem algum produto monitorado no texto
        has_match = any(termo in text.lower() for termo in monitorados)
        
        if has_match:
            print(f"   🔍 Match encontrado, analisando com visão...", file=sys.stderr)
            products = extract_with_vision_api(png_path, store_name)
            
            for p in products:
                if produto_match(p.get('nome', ''), monitorados):
                    all_products.append({
                        'produto': p.get('nome', ''),
                        'preco_oferta': f"R$ {p.get('preco', 'N/A')}",
                        'preco_original': f"R$ {p['preco_original']}" if p.get('preco_original') else None,
                        'unidade': p.get('unidade', ''),
                        'loja': store_name,
                        'pagina': page['page']
                    })
    
    # Get catalog link
    try:
        resp = requests.get(f"https://www.tiendeo.com.br/ponta-grossa/{store_slug}", 
                          headers=HEADERS, timeout=10)
        match = re.search(r'/Catalogos/(\d+)', resp.text)
        if match:
            catalog_link = f"https://www.tiendeo.com.br/Catalogos/{match.group(1)}"
    except:
        pass
    
    # Remove duplicatas
    seen = set()
    unique = []
    for p in all_products:
        key = p['produto'].lower()
        if key not in seen:
            seen.add(key)
            unique.append(p)
    
    print(f"   ✓ {len(unique)} produtos encontrados", file=sys.stderr)
    return unique, catalog_link


def main():
    print("🛒 Iniciando extração de encartes...", file=sys.stderr)
    
    monitorados = load_produtos_monitorados()
    print(f"📋 Monitorando {len(monitorados)} produtos: {monitorados}", file=sys.stderr)
    
    # Processa cada loja
    condor_produtos, condor_link = process_store("supermercados-condor", "Condor", monitorados)
    muffato_produtos, muffato_link = process_store("super-muffato", "Muffato", monitorados)
    
    # Salva resultados
    result = {
        'condor': condor_produtos,
        'muffato': muffato_produtos,
        'links': {
            'condor': condor_link,
            'muffato': muffato_link
        }
    }
    
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
