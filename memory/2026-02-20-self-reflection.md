# Auto-reflexão diária — 2026-02-20 22:00

## 1) Skills
- Atualizei `skills/social-media-poster/SKILL.md` para remover referências antigas de LinkedIn (plataformas, exemplo de uso, credenciais e regras).
- Estado atual: `linkedin-os` continua como skill histórica/discontinued. Mantida por compatibilidade.

## 2) Memória
- Ajustei contradição em `MEMORY.md` sobre VPS do ViralClaw:
  - Antes: linha dizia "NO sudo"
  - Agora: alinhado com estado atual (deploy user com sudo para restart via systemd)
- Sem limpeza adicional hoje para evitar arquivar algo ainda ativo.

## 3) SOUL.md
- Continua coerente com o comportamento desejado (direto, breve, sem fluff). Sem mudanças.

## 4) TOOLS.md
- Corrigi nota desatualizada da seção Reddit:
  - Antes dizia que exigia tab Camofox aberta
  - Agora documenta login automático quando não há sessão válida

## 5) Workflows
- Cron stack geral saudável.
- Otimização sugerida (sem aplicar automaticamente): reduzir colisões de jobs no mesmo horário para diminuir contenção (ex.: one-shots simultâneos de Instagram pessoal).

## 6) AGENTS.md
- Regras ainda fazem sentido. Sem ajuste necessário.

## Pendências que podem precisar do André
1. Confirmar se `skills/linkedin-os/` deve ser removida de vez (hoje está só como histórico/discontinued).
2. Confirmar se materiais antigos de Clinic Agent podem ir para `memory/archive/`.
