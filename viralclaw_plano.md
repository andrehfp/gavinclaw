# ViralClaw - Plano de Implementação Completo

## 📋 Sumário Executivo

**ViralClaw** é uma API de legendagem automática para vídeos curtos (shorts/reels), otimizada para integração com bots OpenClaw.

**Proposta de valor:** Transforma vídeos em conteúdo viral com legendas estilizadas em segundos, via API simples.

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTES                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ OpenClaw │  │ OpenClaw │  │ OpenClaw │  │   API    │        │
│  │   Bot 1  │  │   Bot 2  │  │   Bot N  │  │  Direta  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┴──────┬──────┴─────────────┘               │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    LOAD BALANCER                         │    │
│  │                  (Cloudflare/Nginx)                      │    │
│  │                   api.viralclip.io                       │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VPS PRINCIPAL                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    FastAPI Server                         │   │
│  │                     (Port 8100)                           │   │
│  │                                                           │   │
│  │  Endpoints:                                               │   │
│  │  ├── POST /api/add-captions     (legendar vídeo)         │   │
│  │  ├── POST /api/detect-moments   (detectar momentos)      │   │
│  │  ├── GET  /api/jobs/{id}        (status do job)          │   │
│  │  └── GET  /health               (healthcheck)            │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                    REDIS (Fila)                           │   │
│  │                                                           │   │
│  │  Filas:                                                   │   │
│  │  ├── viralclip:jobs:pending     (jobs aguardando)        │   │
│  │  ├── viralclip:jobs:processing  (em processamento)       │   │
│  │  └── viralclip:jobs:completed   (finalizados)            │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                    WORKERS (N processos)                  │   │
│  │                                                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │Worker 1 │ │Worker 2 │ │Worker 3 │ │Worker N │        │   │
│  │  │ (CPU 1) │ │ (CPU 2) │ │ (CPU 3) │ │ (CPU N) │        │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │   │
│  │       │           │           │           │              │   │
│  │       └───────────┴─────┬─────┴───────────┘              │   │
│  │                         │                                 │   │
│  └─────────────────────────┼────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────▼───────────────────────────────┐    │
│  │                    PostgreSQL                            │    │
│  │                                                          │    │
│  │  Tabelas:                                                │    │
│  │  ├── users          (id, email, created_at)             │    │
│  │  ├── api_keys       (id, key, user_id, credits)         │    │
│  │  ├── jobs           (id, status, input, output, cost)   │    │
│  │  └── usage_logs     (id, api_key_id, cost, timestamp)   │    │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVIÇOS EXTERNOS                           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    GROQ      │  │ CLOUDFLARE   │  │   STRIPE     │          │
│  │   (Whisper)  │  │     R2       │  │  (Pagamento) │          │
│  │              │  │  (Storage)   │  │              │          │
│  │  $0.001/min  │  │  $0.015/GB   │  │   2.9%+$0.30 │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 💰 Análise de Custos Detalhada

### Custos Fixos (Infraestrutura)

| Item | Provedor | Especificação | Custo/mês |
|------|----------|---------------|-----------|
| VPS Principal | Hetzner | CPX31 (4 vCPU, 8GB RAM, 160GB SSD) | €13.99 (~R$77) |
| VPS Backup | Hetzner | CPX21 (3 vCPU, 4GB RAM, 80GB SSD) | €8.49 (~R$47) |
| Domínio | Cloudflare | viralclip.io | ~R$8/mês (R$100/ano) |
| SSL | Cloudflare | Gratuito | R$0 |
| **Total Fixo** | | | **~R$132/mês** |

### Custos Variáveis (Por Uso)

| Serviço | Unidade | Custo | 1K vídeos | 10K vídeos |
|---------|---------|-------|-----------|------------|
| Groq Whisper | por minuto | $0.001 | $1 (R$5) | $10 (R$50) |
| Groq Llama 70B* | por 1K tokens | $0.0006 | $0.60 (R$3) | $6 (R$30) |
| Cloudflare R2 | por GB armazenado | $0.015 | $0.23 (R$1) | $2.30 (R$12) |
| Cloudflare R2 | egress | GRÁTIS | R$0 | R$0 |
| **Total Variável** | | | **~R$9** | **~R$92** |

*Llama só é usado no endpoint detect-moments

### Custo Total por Volume

| Volume | Custo Fixo | Custo Variável | Total | Por Vídeo |
|--------|------------|----------------|-------|-----------|
| 1.000 vídeos/mês | R$132 | R$9 | R$141 | R$0.14 |
| 5.000 vídeos/mês | R$132 | R$45 | R$177 | R$0.035 |
| 10.000 vídeos/mês | R$132 | R$92 | R$224 | R$0.022 |
| 50.000 vídeos/mês | R$200* | R$460 | R$660 | R$0.013 |

*Upgrade de VPS necessário para 50K+

---

## 📊 Modelo de Precificação Sugerido

### Opção 1: Pay-per-Use Simples

| Tier | Preço/vídeo | Margem |
|------|-------------|--------|
| Até 1 min | R$0.25 | ~80% |
| 1-3 min | R$0.50 | ~75% |
| 3-5 min | R$0.75 | ~70% |

### Opção 2: Pacotes de Créditos

| Pacote | Créditos | Preço | Por crédito | Desconto |
|--------|----------|-------|-------------|----------|
| Starter | 100 | R$20 | R$0.20 | - |
| Pro | 500 | R$75 | R$0.15 | 25% |
| Business | 2.000 | R$200 | R$0.10 | 50% |
| Enterprise | 10.000 | R$700 | R$0.07 | 65% |

### Opção 3: Assinatura Mensal

| Plano | Vídeos/mês | Preço | Excedente |
|-------|------------|-------|-----------|
| Free | 10 | R$0 | - |
| Starter | 100 | R$19/mês | R$0.25/vídeo |
| Pro | 500 | R$49/mês | R$0.15/vídeo |
| Business | 2.000 | R$149/mês | R$0.10/vídeo |

---

## 🔄 Sistema de Filas (Alta Demanda)

### Por que Redis?

- **Rápido:** Operações em memória (~1ms)
- **Confiável:** Persistência opcional
- **Simples:** Estruturas de dados nativas
- **Escalável:** Suporta milhões de jobs

### Estrutura da Fila

```python
# Job na fila
{
    "job_id": "uuid",
    "api_key": "vk_live_xxx",
    "video_url": "https://...",
    "style": "hormozi",
    "language": "pt",
    "priority": 1,  # 1=alta, 5=baixa
    "created_at": "2024-01-01T00:00:00Z",
    "webhook_url": "https://callback.cliente.com/done"
}
```

### Fluxo de Processamento

```
1. Cliente envia requisição
   POST /api/add-captions
   
2. API valida API key e créditos
   ├── Créditos insuficientes? → 402 Payment Required
   └── OK? → Continua

3. Job entra na fila Redis
   LPUSH viralclip:jobs:pending {job}
   
4. API retorna imediatamente
   {"job_id": "xxx", "status": "queued", "position": 5}

5. Worker pega job da fila
   BRPOPLPUSH viralclip:jobs:pending viralclip:jobs:processing
   
6. Worker processa
   ├── Download vídeo
   ├── Transcrição (Groq)
   ├── Gera legendas (FFmpeg)
   └── Upload resultado (R2)

7. Worker finaliza
   ├── Atualiza status no PostgreSQL
   ├── Remove da fila de processing
   ├── Debita créditos do cliente
   └── Chama webhook (se configurado)

8. Cliente consulta resultado
   GET /api/jobs/{job_id}
   {"status": "done", "result_url": "https://r2.viralclip.io/xxx.mp4"}
```

### Código do Worker

```python
# worker.py
import redis
import json
from services.viral_captions import generate_captions
from services.storage import upload_to_r2
from services.db import update_job, debit_credits

r = redis.Redis(host='localhost', port=6379, db=0)

def process_job(job_data):
    job = json.loads(job_data)
    job_id = job['job_id']
    
    try:
        # 1. Download vídeo
        video_path = download_video(job['video_url'])
        
        # 2. Processa
        output_path = f"/tmp/{job_id}.mp4"
        generate_captions(video_path, output_path, job['style'], job['language'])
        
        # 3. Upload R2
        result_url = upload_to_r2(output_path, f"{job_id}.mp4")
        
        # 4. Atualiza banco
        update_job(job_id, status='done', result_url=result_url)
        
        # 5. Debita créditos
        debit_credits(job['api_key'], calculate_cost(video_path))
        
        # 6. Webhook
        if job.get('webhook_url'):
            requests.post(job['webhook_url'], json={
                'job_id': job_id,
                'status': 'done',
                'result_url': result_url
            })
            
    except Exception as e:
        update_job(job_id, status='failed', error=str(e))

def main():
    print("Worker iniciado...")
    while True:
        # Espera job por até 30s, depois verifica se deve parar
        job_data = r.brpoplpush(
            'viralclip:jobs:pending',
            'viralclip:jobs:processing',
            timeout=30
        )
        if job_data:
            process_job(job_data)
            r.lrem('viralclip:jobs:processing', 1, job_data)

if __name__ == '__main__':
    main()
```

### Escalando Workers

```bash
# Rodar múltiplos workers (1 por CPU disponível)
# supervisor.conf

[program:viralclip-worker]
command=/home/app/.venv/bin/python worker.py
directory=/home/app/viralclip-api
numprocs=4                    # 4 workers paralelos
process_name=%(program_name)s_%(process_num)02d
autostart=true
autorestart=true
user=app
```

### Capacidade por Configuração

| Workers | Vídeos/hora | Vídeos/dia | Vídeos/mês |
|---------|-------------|------------|------------|
| 1 | 60 | 1.440 | 43.200 |
| 2 | 120 | 2.880 | 86.400 |
| 4 | 240 | 5.760 | 172.800 |
| 8 | 480 | 11.520 | 345.600 |

*Assumindo ~1 minuto por vídeo de 1 minuto

---

## 🔐 Sistema de API Keys

### Estrutura

```sql
-- Tabela de usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    plan VARCHAR(50) DEFAULT 'free'
);

-- Tabela de API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    key VARCHAR(64) UNIQUE NOT NULL,  -- vk_live_xxxx ou vk_test_xxxx
    name VARCHAR(255),
    credits DECIMAL(10,2) DEFAULT 0,
    rate_limit_per_minute INT DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);

-- Tabela de uso
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id),
    job_id UUID,
    endpoint VARCHAR(100),
    video_duration_seconds FLOAT,
    cost_usd DECIMAL(10,6),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Middleware de Autenticação

```python
# middleware/auth.py
from fastapi import Request, HTTPException
from db import get_api_key

async def verify_api_key(request: Request):
    api_key = request.headers.get('X-API-Key')
    
    if not api_key:
        raise HTTPException(401, "API key required")
    
    key_data = await get_api_key(api_key)
    
    if not key_data:
        raise HTTPException(401, "Invalid API key")
    
    if not key_data['is_active']:
        raise HTTPException(403, "API key disabled")
    
    if key_data['credits'] <= 0:
        raise HTTPException(402, "Insufficient credits")
    
    # Rate limiting
    if is_rate_limited(api_key):
        raise HTTPException(429, "Rate limit exceeded")
    
    request.state.api_key = key_data
    return key_data
```

---

## 📁 Upload para Cloudflare R2

### Configuração

```python
# services/storage.py
import boto3
from botocore.config import Config

R2_ACCOUNT_ID = "your-account-id"
R2_ACCESS_KEY = "your-access-key"
R2_SECRET_KEY = "your-secret-key"
R2_BUCKET = "viralclip-output"
R2_PUBLIC_URL = "https://r2.viralclip.io"

s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version='s3v4')
)

def upload_to_r2(local_path: str, remote_name: str) -> str:
    """Upload arquivo para R2 e retorna URL pública"""
    s3.upload_file(
        local_path,
        R2_BUCKET,
        remote_name,
        ExtraArgs={'ContentType': 'video/mp4'}
    )
    return f"{R2_PUBLIC_URL}/{remote_name}"

def delete_from_r2(remote_name: str):
    """Remove arquivo do R2"""
    s3.delete_object(Bucket=R2_BUCKET, Key=remote_name)

def generate_presigned_url(remote_name: str, expires_in: int = 3600) -> str:
    """Gera URL temporária para download"""
    return s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': R2_BUCKET, 'Key': remote_name},
        ExpiresIn=expires_in
    )
```

---

## 🚀 Deploy Passo a Passo

### 1. Provisionar VPS

```bash
# Hetzner Cloud - CPX31
# Ubuntu 24.04
# 4 vCPU, 8GB RAM, 160GB SSD
# Localização: Nuremberg (mais barato) ou Ashburn (mais próximo BR)

# Após criar, SSH:
ssh root@<IP>

# Criar usuário
adduser viralclip
usermod -aG sudo viralclip
su - viralclip
```

### 2. Instalar Dependências

```bash
# Sistema
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.12 python3.12-venv python3-pip \
    redis-server postgresql nginx certbot \
    ffmpeg supervisor git

# Verificar
python3 --version  # 3.12.x
redis-cli ping     # PONG
psql --version     # 16.x
ffmpeg -version    # 6.x
```

### 3. Configurar PostgreSQL

```bash
sudo -u postgres psql

CREATE USER viralclip WITH PASSWORD 'senha-segura';
CREATE DATABASE viralclip OWNER viralclip;
\q

# Testar conexão
psql -U viralclip -d viralclip -h localhost
```

### 4. Clonar e Configurar Projeto

```bash
cd /home/viralclip
git clone https://github.com/seu-repo/viralclip-api.git
cd viralclip-api

# Criar venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configurar variáveis
cp .env.example .env
nano .env
```

```bash
# .env
DATABASE_URL=postgresql://viralclip:senha@localhost/viralclip
REDIS_URL=redis://localhost:6379/0
GROQ_API_KEY=gsk_xxx
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY=xxx
R2_SECRET_KEY=xxx
R2_BUCKET=viralclip-output
R2_PUBLIC_URL=https://r2.viralclip.io
SECRET_KEY=sua-chave-secreta-muito-longa
```

### 5. Configurar Systemd

```bash
# /etc/systemd/system/viralclip-api.service
[Unit]
Description=ViralClaw API
After=network.target redis.service postgresql.service

[Service]
Type=simple
User=viralclip
WorkingDirectory=/home/viralclip/viralclip-api
Environment=PATH=/home/viralclip/viralclip-api/.venv/bin
ExecStart=/home/viralclip/viralclip-api/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8100
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/systemd/system/viralclip-worker@.service
[Unit]
Description=ViralClaw Worker %i
After=network.target redis.service

[Service]
Type=simple
User=viralclip
WorkingDirectory=/home/viralclip/viralclip-api
Environment=PATH=/home/viralclip/viralclip-api/.venv/bin
ExecStart=/home/viralclip/viralclip-api/.venv/bin/python worker.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Habilitar serviços
sudo systemctl daemon-reload
sudo systemctl enable viralclip-api
sudo systemctl enable viralclip-worker@{1..4}  # 4 workers
sudo systemctl start viralclip-api
sudo systemctl start viralclip-worker@{1..4}
```

### 6. Configurar Nginx

```nginx
# /etc/nginx/sites-available/viralclip
server {
    listen 80;
    server_name api.viralclip.io;
    
    location / {
        proxy_pass http://127.0.0.1:8100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Para uploads grandes
        client_max_body_size 500M;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/viralclip /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL com Certbot
sudo certbot --nginx -d api.viralclip.io
```

### 7. Configurar Cloudflare R2

1. Acessar Cloudflare Dashboard → R2
2. Criar bucket "viralclip-output"
3. Configurar domínio customizado: r2.viralclip.io
4. Gerar API token com permissões de leitura/escrita
5. Salvar credenciais no .env

---

## 📈 Monitoramento

### Endpoints de Health

```python
@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now()}

@app.get("/health/deep")
def health_deep():
    checks = {
        "api": "ok",
        "database": check_db(),
        "redis": check_redis(),
        "groq": check_groq(),
        "workers": count_active_workers()
    }
    status = "ok" if all(v == "ok" or isinstance(v, int) for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
```

### Métricas Importantes

```python
# Prometheus metrics
from prometheus_client import Counter, Histogram, Gauge

jobs_total = Counter('viralclip_jobs_total', 'Total jobs', ['status'])
job_duration = Histogram('viralclip_job_duration_seconds', 'Job duration')
queue_size = Gauge('viralclip_queue_size', 'Jobs in queue')
active_workers = Gauge('viralclip_active_workers', 'Active workers')
```

### Alertas (Uptime Robot ou similar)

- API down: GET /health retorna != 200
- Queue crescendo: queue_size > 100
- Workers mortos: active_workers < 2
- Disco cheio: uso > 80%

---

## 🔒 Segurança

### Checklist

- [x] HTTPS obrigatório
- [x] API Keys hasheadas no banco
- [x] Rate limiting por IP e por key
- [x] Validação de input (tamanho máximo, formatos aceitos)
- [x] Sanitização de URLs (evitar SSRF)
- [x] Logs de acesso
- [x] Backups automáticos do banco
- [x] Firewall (apenas portas 22, 80, 443)

### Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/add-captions")
@limiter.limit("10/minute")  # Limite por IP
async def add_captions(request: Request):
    # Limite adicional por API key
    api_key = request.state.api_key
    if api_key['rate_limit_per_minute'] < get_requests_last_minute(api_key['id']):
        raise HTTPException(429, "Rate limit exceeded for your API key")
    ...
```

---

## 📅 Roadmap de Implementação

### Semana 1: Fundação
- [ ] Provisionar VPS Hetzner
- [ ] Instalar stack (Python, Redis, PostgreSQL, FFmpeg)
- [ ] Deploy do código atual
- [ ] Configurar Nginx + SSL
- [ ] Criar bucket R2

### Semana 2: Autenticação e Filas
- [ ] Implementar sistema de API Keys
- [ ] Integrar Redis para filas
- [ ] Implementar workers
- [ ] Testes de carga (100 jobs paralelos)

### Semana 3: Billing e Storage
- [ ] Integrar upload R2
- [ ] Implementar sistema de créditos
- [ ] Dashboard admin básico
- [ ] Documentação da API (OpenAPI/Swagger)

### Semana 4: Polish e Launch
- [ ] Monitoring (Prometheus + Grafana ou serviço externo)
- [ ] Alertas
- [ ] Landing page simples
- [ ] Onboarding de primeiros clientes

---

## 📞 Suporte e Contato

Para dúvidas sobre implementação:
- Email: contato@viralclip.io
- Discord: discord.gg/viralclip

---

*Documento gerado em 07/02/2026 por Gavin (OpenClaw)*
