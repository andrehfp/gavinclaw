# Onboarding sem HAR (Plano recomendado)

## Problema
Clientes finais não sabem o que é HAR, DevTools, ou token de sessão.
Pedir isso no onboarding derruba conversão e aumenta suporte.

## Solução
Criar uma extensão mínima: **Conta Azul Connect**.

Fluxo do usuário:
1. Instalar extensão (Chrome)
2. Abrir Conta Azul e fazer login normalmente
3. Clicar em **Conectar**
4. Ver status **Conectado ✅**

## O que a extensão faz
- valida que a aba está em `pro.contaazul.com`
- coleta contexto autenticado necessário para chamadas internas
- envia credenciais de sessão para o backend por canal seguro
- executa um teste de conectividade (read-only)
- retorna resultado para o usuário

## O que NÃO fazer
- não pedir usuário/senha do cliente
- não pedir HAR/manual DevTools para usuário final
- não depender de script no console

## Arquitetura da extensão (v0)

### Componentes
- `manifest.json` (MV3)
- `service_worker.js` (orquestra handshake com backend)
- `content_script.js` (executa no contexto da Conta Azul)
- `popup.html/js` (botão Conectar + status)

### Permissões mínimas
- `activeTab`
- `storage`
- host permission para `https://pro.contaazul.com/*`
- host permission para API do produto (`https://api.seudominio.com/*`)

## API backend necessária

### POST `/v1/connect/conta-azul`
Recebe payload de conexão e retorna `connection_id` + status.

Exemplo de resposta:
```json
{
  "ok": true,
  "connection_id": "conn_123",
  "tenant_hint": "empresa-x",
  "validated": true
}
```

### POST `/v1/connect/conta-azul/validate`
Executa uma chamada read-only para confirmar sessão válida.

## Dados de onboarding coletados automaticamente
- tenant/empresa ativa
- contas financeiras disponíveis
- categorias principais
- usuário conectado
- validade da sessão

## Fallback (somente interno)
HAR permanece como fallback para debug técnico e QA.
Não usar HAR como fluxo principal de cliente.

## Critérios de pronto (DoD)
- usuário conecta em menos de 2 minutos sem suporte humano
- taxa de sucesso de conexão > 90%
- sessão validada por chamada read-only
- onboarding sem exposição de senha
