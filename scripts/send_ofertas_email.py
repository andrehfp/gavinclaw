#!/usr/bin/env python3
"""
Envia email com ofertas do dia usando Resend (via send_email.py)
"""

import json
import os
import sys

# Adiciona o diretório de scripts ao path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from send_email import send_email

OFERTAS_FILE = os.path.expanduser("~/.openclaw/workspace/lista-mercado/ofertas.json")
APP_URL = "http://mediarr.tail9c9522.ts.net:8765/ofertas"

DESTINATARIOS = [
    "andrehfp@gmail.com",
    "renatacarolsilva@gmail.com"
]


def load_ofertas():
    try:
        with open(OFERTAS_FILE, 'r') as f:
            return json.load(f)
    except:
        return None


def build_html(data):
    """Gera HTML do email"""
    
    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }}
            .container {{ max-width: 500px; margin: 0 auto; background: #fff; border-radius: 10px; padding: 20px; }}
            h1 {{ color: #1a1a2e; font-size: 1.5em; }}
            h1 span {{ color: #00d4aa; }}
            .store {{ background: #f9f9f9; border-radius: 8px; padding: 15px; margin: 15px 0; }}
            .store-name {{ font-weight: bold; font-size: 1.1em; margin-bottom: 10px; }}
            .tozetto {{ color: #16a34a; }}
            .condor {{ color: #2563eb; }}
            .muffato {{ color: #d97706; }}
            .offer {{ padding: 8px 0; border-bottom: 1px solid #eee; }}
            .offer:last-child {{ border: none; }}
            .product {{ font-weight: 500; }}
            .prices {{ color: #666; font-size: 0.9em; }}
            .price-old {{ text-decoration: line-through; color: #999; }}
            .price-new {{ color: #00d4aa; font-weight: bold; }}
            .discount {{ background: #ff6b6b; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; }}
            .btn {{ display: inline-block; background: #00d4aa; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }}
            .footer {{ color: #999; font-size: 0.8em; margin-top: 20px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎯 Ofertas do <span>Dia</span></h1>
            <p>Encontrei produtos da sua lista em promoção!</p>
    """
    
    ofertas = data.get('ofertas', {})
    links = data.get('links', {})
    
    stores = [
        ('tozetto', 'Tozetto', '🟢'),
        ('condor', 'Condor', '🔵'),
        ('muffato', 'Muffato', '🟡')
    ]
    
    for key, name, icon in stores:
        items = ofertas.get(key, [])
        if not items:
            continue
            
        html += f'<div class="store"><div class="store-name {key}">{icon} {name}</div>'
        
        for o in items:
            desconto = o.get('desconto', 0)
            desconto_html = f'<span class="discount">-{desconto:.0f}%</span>' if desconto else ''
            preco_old = f'<span class="price-old">{o.get("preco_original", "")}</span>' if o.get('preco_original') else ''
            
            html += f'''
                <div class="offer">
                    <div class="product">{o.get('produto', '')}</div>
                    <div class="prices">{preco_old} <span class="price-new">{o.get('preco_oferta', '')}</span> {desconto_html}</div>
                </div>
            '''
        
        html += '</div>'
    
    html += f'''
            <a href="{APP_URL}" class="btn">Ver todas as ofertas →</a>
            <div class="footer">
                Enviado por Gavin 🎯<br>
                {data.get('data', '')}
            </div>
        </div>
    </body>
    </html>
    '''
    
    return html


def main():
    data = load_ofertas()
    
    if not data or not data.get('ofertas'):
        print("Sem ofertas para enviar")
        return 1
    
    # Conta total
    total = sum(len(v) for v in data['ofertas'].values())
    
    if total == 0:
        print("Nenhuma oferta encontrada")
        return 1
    
    html = build_html(data)
    subject = f"🎯 {total} ofertas encontradas - {data.get('data', 'Hoje')}"
    
    for email in DESTINATARIOS:
        result = send_email(email, subject, html)
        status = "✓" if result.get('success') else "✗"
        print(f"{status} {email}: {result}")
    
    return 0


if __name__ == "__main__":
    exit(main())
