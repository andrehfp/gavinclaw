#!/usr/bin/env python3
"""
Tiendeo Catalog Image OCR Extractor

Extracts product details from supermarket catalog images using:
- Tesseract OCR
- Google Vision API (fallback)
- OpenCV image processing
"""

import os
import re
import sys
import requests
import cv2
import numpy as np
import pytesseract
from PIL import Image
from google.cloud import vision

# Ensure Google Cloud credentials are set
# export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def preprocess_image(image_path):
    """Preprocess image to improve OCR accuracy"""
    img = cv2.imread(image_path)
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply thresholding to preprocess the image
    gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    
    # Apply deskewing if needed
    coords = np.column_stack(np.where(gray > 0))
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    
    (h, w) = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    
    return rotated

def extract_text_tesseract(image_path):
    """Extract text using Tesseract OCR"""
    preprocessed = preprocess_image(image_path)
    
    # Save preprocessed image
    cv2.imwrite('/tmp/preprocessed_catalog.png', preprocessed)
    
    # Extract text with Tesseract
    text = pytesseract.image_to_string(preprocessed, lang='por')
    return text

def extract_text_google_vision(image_path):
    """Extract text using Google Vision API"""
    client = vision.ImageAnnotatorClient()
    
    with open(image_path, 'rb') as image_file:
        content = image_file.read()
    
    image = vision.Image(content=content)
    response = client.text_detection(image=image)
    texts = response.text_annotations
    
    return texts[0].description if texts else ""

def parse_product_details(text):
    """Parse extracted text to find product details"""
    # Regex patterns for Portuguese product detection
    patterns = {
        'produto': r'(.*?)\s*R\$\s*(\d+[\.,]\d{2})\s*por\s*R\$\s*(\d+[\.,]\d{2})',
        'preco_de': r'de\s*R\$\s*(\d+[\.,]\d{2})',
        'preco_por': r'por\s*R\$\s*(\d+[\.,]\d{2})'
    }
    
    products = []
    lines = text.split('\n')
    
    for line in lines:
        match = re.search(patterns['produto'], line, re.IGNORECASE)
        if match:
            produto = match.group(1).strip()
            preco_de = match.group(2)
            preco_por = match.group(3)
            
            products.append({
                'produto': produto,
                'preco_original': f'R$ {preco_de}',
                'preco_oferta': f'R$ {preco_por}',
                'desconto': round((1 - float(preco_por.replace(',', '.')) / float(preco_de.replace(',', '.'))) * 100, 2)
            })
    
    return products

def download_catalog_image(catalog_url):
    """Download catalog image"""
    try:
        resp = requests.get(catalog_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        
        # Find image URL (adjust based on Tiendeo HTML structure)
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, 'html.parser')
        img_tag = soup.find('img', class_='catalog-page-img')
        
        if img_tag and 'src' in img_tag.attrs:
            img_url = img_tag['src']
            img_resp = requests.get(img_url, headers=HEADERS, timeout=30)
            img_resp.raise_for_status()
            
            # Save image
            img_path = '/tmp/tiendeo_catalog.jpg'
            with open(img_path, 'wb') as f:
                f.write(img_resp.content)
            
            return img_path
    except Exception as e:
        print(f"Error downloading catalog image: {e}", file=sys.stderr)
    
    return None

def main(catalog_url):
    """Main extraction pipeline"""
    # Download catalog image
    img_path = download_catalog_image(catalog_url)
    
    if not img_path:
        print("Failed to download catalog image", file=sys.stderr)
        return []
    
    # Try Tesseract first
    tesseract_text = extract_text_tesseract(img_path)
    products_tesseract = parse_product_details(tesseract_text)
    
    if products_tesseract:
        return products_tesseract
    
    # Fallback to Google Vision
    try:
        vision_text = extract_text_google_vision(img_path)
        products_vision = parse_product_details(vision_text)
        
        if products_vision:
            return products_vision
    except Exception as e:
        print(f"Google Vision extraction failed: {e}", file=sys.stderr)
    
    return []

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tiendeo_ocr_extractor.py <catalog_url>", file=sys.stderr)
        sys.exit(1)
    
    catalog_url = sys.argv[1]
    products = main(catalog_url)
    
    # Output as JSON for easy parsing
    import json
    print(json.dumps(products, ensure_ascii=False, indent=2))