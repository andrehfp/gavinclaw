#!/usr/bin/env python3
"""
Scraper de encartes de supermercados em Ponta Grossa
- Tozetto: site próprio (tozetto.com.br/ofertas)
- Condor: Tiendeo
- Muffato: Tiendeo

Filtra ofertas pela lista de produtos monitorados em produtos_monitorados.json
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime
import json
import re
import sys
import os

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUTOS_FILE = os.path.join(SCRIPT_DIR, "produtos_monitorados.json")
LISTA_COMPRAS_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), "lista-mercado", "data.json")


def load_produtos_monitorados():
    """Carrega lista fixa de produtos monitorados"""
    try:
        with open(PRODUTOS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return [p.lower() for p in data.get('produtos', [])]
    except Exception as e:
        print(f"Erro ao carregar produtos monitorados: {e}", file=sys.stderr)
        return []


def load_lista_compras():
    """Carrega lista de compras do app"""
    try:
        with open(LISTA_COMPRAS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Pega só itens não marcados como comprados
            itens = [item['text'].lower() for item in data.get('itens', []) if not item.get('checked', False)]
            return itens
    except Exception as e:
        print(f"Erro ao carregar lista de compras: {e}", file=sys.stderr)
        return []


def load_todos_produtos():
    """Combina lista fixa + lista de compras"""
    monitorados = load_produtos_monitorados()
    compras = load_lista_compras()
    
    # Combina sem duplicatas
    todos = list(set(monitorados + compras))
    return todos


def produto_match(nome_produto, lista_monitorados):
    """Verifica se o produto está na lista de monitorados"""
    nome_lower = nome_produto.lower()
    for termo in lista_monitorados:
        if termo in nome_lower:
            return True
    return False

def scrape_tozetto():
    """Scrape ofertas do Tozetto - site próprio"""
    url = "https://www.tozetto.com.br/ofertas"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        ofertas = []
        
        # Find all offer boxes
        for box in soup.find_all('div', class_='box_ofertas'):
            try:
                # Get product name - it's a NavigableString directly in the box
                from bs4 import NavigableString
                produto = None
                for child in box.children:
                    if isinstance(child, NavigableString):
                        text = child.strip()
                        if text and 'R$' not in text and 'válido' not in text.lower():
                            produto = text
                            break
                
                # Get prices
                preco_de = box.find('div', class_='promo_de')
                preco_por = box.find('div', class_='promo_por')
                validade = box.find('div', class_='valido_ate')
                
                if produto and preco_por:
                    ofertas.append({
                        'produto': produto,
                        'preco_original': preco_de.get_text().strip().replace('de ', '') if preco_de else '',
                        'preco_oferta': preco_por.get_text().strip().replace('por ', '').replace('*', ''),
                        'validade': validade.get_text().strip().replace('válido até ', '') if validade else ''
                    })
            except Exception as e:
                continue
        
        return ofertas
    except Exception as e:
        print(f"Erro ao scrape Tozetto: {e}", file=sys.stderr)
        return []


def scrape_tiendeo_store(store_slug, store_name):
    """Scrape ofertas do Tiendeo para uma loja específica"""
    url = f"https://www.tiendeo.com.br/ponta-grossa/{store_slug}"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Find catalog links
        catalogs = []
        for link in soup.find_all('a', href=re.compile(r'/Catalogos/\d+')):
            href = link.get('href')
            catalog_id = re.search(r'/Catalogos/(\d+)', href)
            if catalog_id:
                catalogs.append({
                    'id': catalog_id.group(1),
                    'url': f"https://www.tiendeo.com.br{href.split('?')[0]}",
                    'loja': store_name
                })
        
        # Remove duplicates
        seen = set()
        unique_catalogs = []
        for c in catalogs:
            if c['id'] not in seen:
                seen.add(c['id'])
                unique_catalogs.append(c)
        
        return unique_catalogs[:3]  # Limit to 3 most recent
        
    except Exception as e:
        print(f"Erro ao scrape Tiendeo {store_name}: {e}", file=sys.stderr)
        return []


def scrape_tiendeo_ocr(store_slug, store_name, monitorados):
    """Extrai produtos dos encartes via OCR"""
    import subprocess
    
    url = f"https://www.tiendeo.com.br/ponta-grossa/{store_slug}"
    ofertas = []
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        
        # Encontra páginas do catálogo
        pages = re.findall(
            r'page_assets/(\d+)/(\d+)/page_\d+_level_2_(\d+)\.webp',
            resp.text
        )
        
        if not pages:
            return []
        
        catalog_id = pages[0][0]
        seen_pages = set()
        
        for cat_id, page_num, hash_val in pages[:4]:
            if page_num in seen_pages:
                continue
            seen_pages.add(page_num)
            
            img_url = f"https://pt-br-media-publications.shopfully.cloud/publications/page_assets/{catalog_id}/{page_num}/page_{page_num}_level_2_{hash_val}.webp"
            
            # Baixa imagem
            os.makedirs("/tmp/encartes", exist_ok=True)
            webp_path = f"/tmp/encartes/{store_slug}_p{page_num}.webp"
            png_path = f"/tmp/encartes/{store_slug}_p{page_num}.png"
            
            img_resp = requests.get(img_url, headers=HEADERS, timeout=30)
            with open(webp_path, 'wb') as f:
                f.write(img_resp.content)
            
            # Converte para PNG
            subprocess.run(['convert', webp_path, png_path], capture_output=True)
            
            # OCR
            result = subprocess.run(
                ['tesseract', png_path, 'stdout', '-l', 'por'],
                capture_output=True, text=True, timeout=30
            )
            text = result.stdout.lower()
            
            # Busca produtos monitorados
            for termo in monitorados:
                if termo in text:
                    # Tenta achar preço
                    pattern = rf'{re.escape(termo)}[^0-9]*?(\d+[,\.]\d{{2}})'
                    match = re.search(pattern, text)
                    
                    ofertas.append({
                        'produto': termo.title(),
                        'preco_oferta': f"R$ {match.group(1)}" if match else "Ver encarte",
                        'loja': store_name,
                        'pagina': page_num
                    })
        
        # Remove duplicatas
        seen = set()
        unique = []
        for o in ofertas:
            key = o['produto']
            if key not in seen:
                seen.add(key)
                unique.append(o)
        
        return unique
        
    except Exception as e:
        print(f"Erro OCR {store_name}: {e}", file=sys.stderr)
        return []


def format_telegram_message(tozetto_ofertas, condor_ofertas, muffato_ofertas, condor_catalogs, muffato_catalogs):
    """Format the offers for Telegram - só mostra produtos monitorados"""
    
    todas_ofertas = tozetto_ofertas + condor_ofertas + muffato_ofertas
    
    if not todas_ofertas:
        return None  # Não envia mensagem se não encontrou nada
    
    lines = []
    today = datetime.now().strftime("%d/%m/%Y")
    
    lines.append(f"🎯 **ALERTA DE OFERTAS - {today}**\n")
    lines.append("Encontrei produtos da sua lista!\n")
    
    # Tozetto
    if tozetto_ofertas:
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        lines.append("🟢 **TOZETTO**")
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        
        tozetto_ofertas.sort(key=lambda x: x.get('desconto', 0), reverse=True)
        
        for o in tozetto_ofertas:
            desconto = o.get('desconto', 0)
            lines.append(f"• **{o.get('produto', 'N/A')}**")
            if desconto > 0:
                lines.append(f"  ~~{o.get('preco_original', '')}~~ → **{o.get('preco_oferta', '')}** (-{desconto:.0f}%)")
            else:
                lines.append(f"  **{o.get('preco_oferta', '')}**")
        
        lines.append(f"🔗 https://www.tozetto.com.br/ofertas\n")
    
    # Condor
    if condor_ofertas:
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        lines.append("🔵 **CONDOR**")
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        
        for o in condor_ofertas:
            lines.append(f"• **{o.get('produto', 'N/A')}** - {o.get('preco_oferta', '')}")
        
        if condor_catalogs:
            lines.append(f"🔗 {condor_catalogs[0]['url']}\n")
    
    # Muffato
    if muffato_ofertas:
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        lines.append("🟡 **MUFFATO**")
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        
        for o in muffato_ofertas:
            lines.append(f"• **{o.get('produto', 'N/A')}** - {o.get('preco_oferta', '')}")
        
        if muffato_catalogs:
            lines.append(f"🔗 {muffato_catalogs[0]['url']}\n")
    
    # Se só tem ofertas do Tozetto, adiciona links dos encartes
    if not condor_ofertas and not muffato_ofertas:
        if muffato_catalogs or condor_catalogs:
            lines.append("📄 **Outros encartes:**")
            if condor_catalogs:
                lines.append(f"• Condor: {condor_catalogs[0]['url']}")
            if muffato_catalogs:
                lines.append(f"• Muffato: {muffato_catalogs[0]['url']}")
    
    return "\n".join(lines)


OFERTAS_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), "lista-mercado", "ofertas.json")


def save_ofertas_json(tozetto, condor, muffato, condor_catalogs, muffato_catalogs):
    """Salva ofertas em JSON para a página HTML"""
    data = {
        'data': datetime.now().strftime("%d/%m/%Y"),
        'atualizado': datetime.now().isoformat(),
        'ofertas': {
            'tozetto': tozetto,
            'condor': condor,
            'muffato': muffato
        },
        'links': {
            'tozetto': 'https://www.tozetto.com.br/ofertas',
            'condor': condor_catalogs[0]['url'] if condor_catalogs else None,
            'muffato': muffato_catalogs[0]['url'] if muffato_catalogs else None
        }
    }
    
    with open(OFERTAS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return data


def main():
    print("Scraping ofertas...", file=sys.stderr)
    
    # Carrega lista fixa + lista de compras do app
    monitorados_fixos = load_produtos_monitorados()
    lista_compras = load_lista_compras()
    monitorados = load_todos_produtos()
    
    print(f"Lista fixa: {len(monitorados_fixos)} | Lista compras: {len(lista_compras)} | Total: {len(monitorados)}", file=sys.stderr)
    
    # Scrape Tozetto (site próprio)
    tozetto_todas = scrape_tozetto()
    print(f"Tozetto: {len(tozetto_todas)} ofertas totais", file=sys.stderr)
    
    # Filtra ofertas Tozetto pelos produtos monitorados
    tozetto_filtradas = []
    for o in tozetto_todas:
        if produto_match(o.get('produto', ''), monitorados):
            try:
                original = float(o.get('preco_original', 'R$0').replace('R$', '').replace(',', '.'))
                oferta = float(o.get('preco_oferta', 'R$0').replace('R$', '').replace(',', '.'))
                if original > 0:
                    o['desconto'] = ((original - oferta) / original) * 100
            except:
                o['desconto'] = 0
            tozetto_filtradas.append(o)
    
    print(f"Tozetto filtrado: {len(tozetto_filtradas)} produtos", file=sys.stderr)
    
    # Scrape Tiendeo (links dos catálogos)
    condor_catalogs = scrape_tiendeo_store("supermercados-condor", "Condor")
    muffato_catalogs = scrape_tiendeo_store("super-muffato", "Super Muffato")
    
    # Scrape encartes via OCR
    print("Extraindo encartes via OCR...", file=sys.stderr)
    condor_ofertas = scrape_tiendeo_ocr("supermercados-condor", "Condor", monitorados)
    muffato_ofertas = scrape_tiendeo_ocr("super-muffato", "Muffato", monitorados)
    
    print(f"Condor OCR: {len(condor_ofertas)} produtos", file=sys.stderr)
    print(f"Muffato OCR: {len(muffato_ofertas)} produtos", file=sys.stderr)
    
    # Salva ofertas em JSON para a página HTML
    save_ofertas_json(tozetto_filtradas, condor_ofertas, muffato_ofertas, condor_catalogs, muffato_catalogs)
    print(f"Ofertas salvas em {OFERTAS_FILE}", file=sys.stderr)
    
    # Conta total de ofertas
    total = len(tozetto_filtradas) + len(condor_ofertas) + len(muffato_ofertas)
    
    # Limpa imagens temporárias
    import shutil
    shutil.rmtree("/tmp/encartes", ignore_errors=True)
    print("Imagens temporárias limpas", file=sys.stderr)
    
    if total > 0:
        # Lista os produtos encontrados
        produtos = []
        for o in tozetto_filtradas + condor_ofertas + muffato_ofertas:
            produtos.append(o.get('produto', ''))
        
        produtos_unicos = list(set(produtos))
        
        # Mensagem curta para Telegram
        print(f"OFERTAS_ENCONTRADAS:{total}")
        print(f"PRODUTOS:{','.join(produtos_unicos)}")
        return 0
    else:
        print("NO_ALERT", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())
