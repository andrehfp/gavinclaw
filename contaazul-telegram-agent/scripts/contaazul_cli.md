# contaazul_cli.py

CLI para operar Conta Azul via APIs internas (usando sessão de um HAR logado).

## Arquivo
- `scripts/contaazul_cli.py`

## Requisito
- HAR exportado do DevTools já autenticado na Conta Azul.
- O HAR precisa conter header `x-authorization` em requests para `services.contaazul.com`.

## Uso rápido

```bash
python3 scripts/contaazul_cli.py --har /caminho/session.har list-installments --type REVENUE --due-from 2026-02-01 --due-to 2026-05-31
```

Opcionalmente:
```bash
export CONTAAZUL_HAR=/caminho/session.har
python3 scripts/contaazul_cli.py list-installments --type REVENUE --due-from 2026-02-01 --due-to 2026-05-31
```

## Comandos

### 1) Criar cliente
```bash
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  create-client --name "Cliente Teste" --cpf 12345678909 --email teste@example.com
```

### 2) Listar clientes/fornecedores
```bash
# ambos (default), com documento mascarado
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  list-people

# só clientes, busca por nome e documento completo
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  list-people --profile customer --search "renata" --show-document
```

### 3) Criar conta financeira
```bash
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  create-fin-account --name "Conta API" --agency 0001 --account 1234567 --bank-code 479 --initial-balance 1000
```

### 4) Criar conta a receber
```bash
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  create-receivable \
  --negotiator-id <UUID_CLIENTE> \
  --category-id <UUID_CATEGORIA> \
  --description "Serviço X" \
  --value 333 \
  --due-date 2026-03-01 \
  --installments 3
```

### 5) Criar conta a pagar
```bash
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  create-payable \
  --negotiator-id <UUID_FORNECEDOR> \
  --category-id <UUID_CATEGORIA_EXPENSE> \
  --description "Despesa Y" \
  --value 150 \
  --due-date 2026-03-05
```

### 6) Listar parcelas (receber/pagar)
```bash
# receber
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  list-installments --type REVENUE --due-from 2026-02-01 --due-to 2026-05-31

# pagar
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  list-installments --type EXPENSE --due-from 2026-02-01 --due-to 2026-05-31
```

### 7) Marcar parcela como recebida/paga
```bash
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  acquit \
  --installment-id <UUID_PARCELA> \
  --financial-account-id <UUID_CONTA_FINANCEIRA> \
  --amount 111
```

### 8) Emitir recibo PDF
```bash
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  receipt --installment-id <UUID_PARCELA> --out recibo.pdf
```

### 9) Extrato de movimentações (financeiro)
```bash
# saída em texto
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  statement --from 2026-02-01 --to 2026-02-28

# saída em CSV
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  statement --from 2026-02-01 --to 2026-02-28 --csv extrato-fev.csv

# resposta bruta JSON
python3 scripts/contaazul_cli.py --har "$CONTAAZUL_HAR" \
  statement --from 2026-02-01 --to 2026-02-28 --raw
```

## Observações
- Como são APIs internas, podem quebrar sem aviso.
- Reexporte HAR quando token/sessão expirar.
- Não commitar HAR com credenciais/token.
