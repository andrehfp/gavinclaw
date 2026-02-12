#!/usr/bin/env python3
"""
Auto-publisher - Verifica agenda e publica shorts no horário
Rodar via cron a cada 5 minutos
"""

import json
import pickle
import sys
from datetime import datetime
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

BASE_DIR = Path(__file__).parent
SCHEDULE_FILE = BASE_DIR / 'schedule.json'
TOKEN_FILE = Path.home() / '.openclaw' / '.secrets' / 'youtube_token.pickle'


def load_schedule():
    if SCHEDULE_FILE.exists():
        return json.loads(SCHEDULE_FILE.read_text())
    return {'shorts': []}


def save_schedule(data):
    SCHEDULE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def get_youtube():
    with open(TOKEN_FILE, 'rb') as f:
        credentials = pickle.load(f)
    return build('youtube', 'v3', credentials=credentials)


def upload_short(youtube, short):
    """Faz upload do short para o YouTube"""
    body = {
        'snippet': {
            'title': short['title'] + ' #shorts',
            'description': short.get('description', ''),
            'tags': ['shorts', 'programacao', 'ia', 'devtips'],
            'categoryId': '28'
        },
        'status': {
            'privacyStatus': 'public',
            'selfDeclaredMadeForKids': False
        }
    }
    
    media = MediaFileUpload(short['path'], mimetype='video/mp4', resumable=True)
    
    request = youtube.videos().insert(
        part='snippet,status',
        body=body,
        media_body=media
    )
    
    response = None
    while response is None:
        status, response = request.next_chunk()
    
    return response['id']


def main():
    schedule = load_schedule()
    now = datetime.now()
    
    # Encontra shorts para publicar
    to_publish = []
    for short in schedule['shorts']:
        if short.get('published'):
            continue
        
        scheduled_time = datetime.fromisoformat(short['datetime'])
        if scheduled_time <= now:
            to_publish.append(short)
    
    if not to_publish:
        print("Nenhum short para publicar agora")
        return 0
    
    youtube = get_youtube()
    
    for short in to_publish:
        print(f"Publicando: {short['title']}")
        try:
            video_id = upload_short(youtube, short)
            short['published'] = True
            short['video_id'] = video_id
            short['published_at'] = now.isoformat()
            print(f"✓ Publicado: https://youtube.com/shorts/{video_id}")
        except Exception as e:
            print(f"✗ Erro: {e}")
    
    save_schedule(schedule)
    return 0


if __name__ == "__main__":
    sys.exit(main())
