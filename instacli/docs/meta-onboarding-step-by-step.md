# Guia Rapido: Meta App + Pagina

Este guia e para quem ainda nao tem app na Meta nem Pagina conectada.
Siga na ordem e volte para `ig onboarding` apos cada bloco.

## Checklist inicial
- Conta do Instagram em modo `Professional` (`Creator` ou `Business`).
- Conta do Instagram conectada a uma Pagina do Facebook.
- Acesso ao Meta App Dashboard e ao Graph API Explorer.

## Passo 1: Criar o app na Meta
1. Abra https://developers.facebook.com/apps
2. Clique em `Create App`.
3. Selecione `Business` (ou o tipo equivalente de integracao).
4. Preencha nome do app e email de contato.
5. Em `Settings -> Basic`, confirme `App ID` e `App Secret`.

## Passo 2: Criar/conectar a Pagina
1. Crie uma Pagina no Facebook (ou escolha uma que voce gerencia).
2. No Instagram, mude para conta Professional se necessario.
3. Conecte o Instagram a essa Pagina.
4. Confirme que a Pagina aparece na lista de paginas da sua conta.

## Passo 3: Gerar USER token no Graph API Explorer
1. Abra https://developers.facebook.com/tools/explorer/
2. Selecione o app criado.
3. Adicione as permissoes:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
4. Escolha `User Token` e clique em `Generate Access Token`.
5. Conclua login/consentimento e copie o token.

## Passo 4: Continuar no CLI
1. Volte para o terminal com `ig onboarding`.
2. Aperte ENTER quando o wizard pedir.
3. Cole o `USER access token`.
4. Se houver varias paginas, escolha a pagina correta.

## Validar
```bash
ig auth status --json --quiet
ig media list --limit 5 --json --quiet
```

## Erros comuns
- Usar `App ID` no lugar de `IG account id`.
- Colar token placeholder/exemplo em vez de token real.
- Instagram sem conexao com nenhuma Pagina.
