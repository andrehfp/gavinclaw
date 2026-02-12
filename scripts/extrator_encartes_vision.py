#!/usr/bin/env python3
"""
Extrator de encartes usando Vision API (via OpenClaw)
Baixa imagens dos encartes e extrai produtos/preços
"""

import requests
import re
import sys
import json
import os
import subprocess
from datetime import datetime

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUTOS_FILE = os.path.join(SCRIPT_DIR, "produtos_monitorados.json")
TEMP_DIR = "/tmp/encartes"


def load_produtos_monitorados():
    """Carrega lista de produtos monitorados"""
    try:
        with open(PRODUTOS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return [p.lower() for p in data.get('produtos', [])]
    except:
        return []


def get_catalog_pages(store_slug):
    """Extrai URLs das páginas do catálogo"""
    url = f"https://www.tiendeo.com.br/ponta-grossa/{store_slug}"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        
        # Encontra IDs de catálogos
        catalog_ids = re.findall(r'page_assets/(\d+)/\d+/page_', resp.text)
        catalog_ids = list(set(catalog_ids))
        
        if not catalog_ids:
            return []
        
        catalog_id = catalog_ids[0]  # Pega o mais recente
        
        # Encontra todas as páginas
        pages = re.findall(
            rf'page_assets/{catalog_id}/(\d+)/page_\d+_level_2_(\d+)\.webp',
            resp.text
        )
        
        # Remove duplicatas mantendo ordem
        seen = set()
        unique_pages = []
        for page_num, hash_val in pages:
            if page_num not in seen:
                seen.add(page_num)
                unique_pages.append({
                    'page': int(page_num),
                    'url': f"https://pt-br-media-publications.shopfully.cloud/publications/page_assets/{catalog_id}/{page_num}/page_{page_num}_level_2_{hash_val}.webp"
                })
        
        return sorted(unique_pages, key=lambda x: x['page'])
    
    except Exception as e:
        print(f"Erro ao buscar catálogo {store_slug}: {e}", file=sys.stderr)
        return []


def download_page(url, filename):
    """Baixa e converte página do encarte"""
    os.makedirs(TEMP_DIR, exist_ok=True)
    
    webp_path = os.path.join(TEMP_DIR, f"{filename}.webp")
    png_path = os.path.join(TEMP_DIR, f"{filename}.png")
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        
        with open(webp_path, 'wb') as f:
            f.write(resp.content)
        
        # Converte para PNG
        subprocess.run(['convert', webp_path, png_path], check=True, capture_output=True)
        
        return png_path
    except Exception as e:
        print(f"Erro ao baixar {url}: {e}", file=sys.stderr)
        return None


def extract_with_tesseract(image_path):
    """Extrai texto com Tesseract (fallback)"""
    try:
        result = subprocess.run(
            ['tesseract', image_path, 'stdout', '-l', 'por'],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout
    except:
        return ""


def parse_tesseract_output(text, monitorados):
    """Tenta extrair produtos do texto OCR"""
    ofertas = []
    text_lower = text.lower()
    
    for termo in monitorados:
        if termo in text_lower:
            # Tenta encontrar preço próximo
            pattern = rf'{re.escape(termo)}[^0-9]*?R?\$?\s*(\d+[,\.]\d{{2}})'
            match = re.search(pattern, text_lower)
            
            ofertas.append({
                'produto': termo.title(),
                'preco_oferta': f"R$ {match.group(1)}" if match else "Ver encarte",
                'loja': 'Encarte',
                'encontrado_ocr': True
            })
    
    return ofertas


def main():
    """Extrai ofertas dos encartes"""
    monitorados = load_produtos_monitorados()
    print(f"Monitorando: {monitorados}", file=sys.stderr)
    
    todas_ofertas = []
    
    for store, slug in [("Condor", "supermercados-condor"), ("Muffato", "super-muffato")]:
        print(f"\nProcessando {store}...", file=sys.stderr)
        
        pages = get_catalog_pages(slug)
        print(f"  {len(pages)} páginas encontradas", file=sys.stderr)
        
        for page in pages[:4]:  # Limita a 4 páginas por loja
            print(f"  Página {page['page']}...", file=sys.stderr)
            
            img_path = download_page(page['url'], f"{slug}_p{page['page']}")
            if not img_path:
                continue
            
            # Extrai com Tesseract
            text = extract_with_tesseract(img_path)
            ofertas = parse_tesseract_output(text, monitorados)
            
            for o in ofertas:
                o['loja'] = store
                o['pagina'] = page['page']
                todas_ofertas.append(o)
    
    # Remove duplicatas
    seen = set()
    unique = []
    for o in todas_ofertas:
        key = f"{o['loja']}_{o['produto']}"
        if key not in seen:
            seen.add(key)
            unique.append(o)
    
    print(json.dumps(unique, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
