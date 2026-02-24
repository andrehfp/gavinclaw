# IGCLI Beta - Onboarding via OpenClaw (Testers)

Este guia é para testers que usam o próprio OpenClaw.

## Resumo rápido

- O OpenClaw do tester executa praticamente tudo.
- O único passo manual é gerar e colar o `USER_ACCESS_TOKEN` da Meta quando solicitado.
- **Não compartilhar App Secret** com testers.

## O que o tester precisa ter

1. Convite aceito no app da Meta (role Tester ou equivalente).
2. Projeto IGCLI extraído localmente (`instacli/`).
3. Node + pnpm instalados.

## Prompt único para o OpenClaw do tester

Peça para o tester enviar exatamente este prompt para o OpenClaw dele:

```text
Configure e valide o IGCLI beta neste host.

Objetivo:
- Instalar dependências
- Buildar CLI
- Executar onboarding
- Configurar Meta via token
- Validar auth e media
- Rodar publish em dry-run
- Retornar relatório final em JSON

Passos:
1) Entrar na pasta do projeto: instacli
2) Executar:
   - pnpm install --frozen-lockfile
   - pnpm build
3) Onboarding:
   - node packages/ig-cli/dist/bin.js onboarding --no-start
4) Configurar token-first:
   - node packages/ig-cli/dist/bin.js setup meta-token --discover-pages --user-access-token <USER_ACCESS_TOKEN>
5) Validar:
   - node packages/ig-cli/dist/bin.js auth status --json --quiet
   - node packages/ig-cli/dist/bin.js media list --limit 5 --json --quiet
6) Teste de publish sem risco:
   - node packages/ig-cli/dist/bin.js publish photo --file https://example.com/a.jpg --caption "beta test" --json --quiet --dry-run
7) Em falha transitória, tentar até 3 vezes.
8) Responder SOMENTE com JSON:
{
  "ok": true/false,
  "host": "<hostname>",
  "steps": [
    {"name":"install","ok":true},
    {"name":"build","ok":true},
    {"name":"setup_meta_token","ok":true},
    {"name":"auth_status","ok":true},
    {"name":"media_list","ok":true},
    {"name":"publish_dry_run","ok":true}
  ],
  "account": {"ig_username":"...", "ig_account_id":"..."},
  "errors": []
}
```

## Instrução crítica para token (enviar para o tester)

Quando o OpenClaw pedir `<USER_ACCESS_TOKEN>`, gerar no Graph API Explorer com scopes:

- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`
- `pages_read_engagement`

Links úteis:
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Apps Dashboard: https://developers.facebook.com/apps

## Checklist de aceite (para você)

Considere tester aprovado se:

- `auth status` retorna ok
- `media list` retorna dados sem erro de auth
- `publish photo --dry-run` retorna ok
- JSON final veio completo
