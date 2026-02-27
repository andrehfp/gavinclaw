#!/usr/bin/env python3
"""
Conta Azul internal API helper (HAR-auth based).

Usage examples:
  python3 scripts/contaazul_cli.py --har /path/to/session.har list-installments --type REVENUE --due-from 2026-02-01 --due-to 2026-05-31
  python3 scripts/contaazul_cli.py --har /path/to/session.har create-client --name "Cliente Teste" --cpf 12345678909
  python3 scripts/contaazul_cli.py --har /path/to/session.har create-fin-account --name "Conta 1" --agency 0001 --account 1234567
  python3 scripts/contaazul_cli.py --har /path/to/session.har acquit --installment-id <UUID> --financial-account-id <UUID> --amount 111
  python3 scripts/contaazul_cli.py --har /path/to/session.har receipt --installment-id <UUID> --out recibo.pdf
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests

BASE = "https://services.contaazul.com"


@dataclass
class AuthContext:
    headers: Dict[str, str]


def _read_har(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_headers_from_har(har: Dict[str, Any]) -> Dict[str, str]:
    entries = har.get("log", {}).get("entries", [])

    preferred_contains = [
        "/finance-pro/v1/installments/",
        "/finance-pro/v1/financial-events",
        "/finance-pro-reader/v1/installment-view",
        "/app/financial-accounts",
    ]

    candidate = None
    for needle in preferred_contains:
        for e in entries:
            req = e.get("request", {})
            url = req.get("url", "")
            if "services.contaazul.com" in url and needle in url:
                hdrs = {h.get("name", "").lower(): h.get("value", "") for h in req.get("headers", [])}
                if hdrs.get("x-authorization"):
                    candidate = req
                    break
        if candidate:
            break

    if not candidate:
        for e in entries:
            req = e.get("request", {})
            url = req.get("url", "")
            if "services.contaazul.com" not in url:
                continue
            hdrs = {h.get("name", "").lower(): h.get("value", "") for h in req.get("headers", [])}
            if hdrs.get("x-authorization"):
                candidate = req
                break

    if not candidate:
        raise RuntimeError("Não encontrei headers com x-authorization no HAR.")

    headers: Dict[str, str] = {}
    for h in candidate.get("headers", []):
        name = h.get("name", "")
        if not name or name.startswith(":"):
            continue
        lname = name.lower()
        if lname in {"content-length", "host", "authority", "path", "method", "scheme"}:
            continue
        headers[name] = h.get("value", "")

    # guardrails/defaults
    headers.setdefault("accept", "application/json")
    headers.setdefault("content-type", "application/json")
    headers.setdefault("origin", "https://pro.contaazul.com")
    headers.setdefault("referer", "https://pro.contaazul.com/")

    if not any(k.lower() == "x-authorization" for k in headers.keys()):
        raise RuntimeError("HAR sem x-authorization utilizável.")

    return headers


def auth_from_har(path: str) -> AuthContext:
    har = _read_har(path)
    headers = _extract_headers_from_har(har)
    return AuthContext(headers=headers)


def req(ctx: AuthContext, method: str, path: str, *, params=None, json_body=None, timeout=30) -> requests.Response:
    url = f"{BASE}{path}"
    r = requests.request(method, url, headers=ctx.headers, params=params, json=json_body, timeout=timeout)
    return r


def die_response(r: requests.Response) -> None:
    snippet = r.text[:1200] if r.text else ""
    raise SystemExit(f"HTTP {r.status_code} em {r.request.method} {r.url}\n{snippet}")


def cmd_create_client(ctx: AuthContext, args: argparse.Namespace) -> None:
    payload = {
        "personType": "Física",
        "legalDocument": None,
        "naturalDocument": args.cpf,
        "name": args.name,
        "code": "",
        "isActive": True,
        "isOptingSimple": False,
        "companyName": "",
        "generalRegistry": "",
        "birthDate": "",
        "email": args.email or "",
        "commercialPhone": "",
        "cellPhone": "",
        "observation": args.observation,
        "idContactPrincipal": "",
        "profiles": [{"profileType": "Cliente"}],
    }
    r = req(ctx, "POST", "/contaazul-bff/person-registration/v1/persons", json_body=payload)
    if r.status_code != 200:
        die_response(r)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))


def _build_event_payload(args: argparse.Namespace, kind: str) -> Dict[str, Any]:
    today = dt.date.today()
    competence_date = args.competence_date or str(today)
    first_due = dt.datetime.strptime(args.due_date, "%Y-%m-%d").date()

    n = args.installments
    total = float(args.value)
    cents_total = int(round(total * 100))

    # split cents evenly
    base = cents_total // n
    rem = cents_total % n
    values = [base + (1 if i < rem else 0) for i in range(n)]

    installments = []
    for i, cents in enumerate(values, start=1):
        due = first_due + dt.timedelta(days=args.interval_days * (i - 1))
        pct = int(round((cents / cents_total) * 100)) if cents_total else 0
        installments.append(
            {
                "index": i,
                "acquittances": [],
                "valueComposition": {
                    "grossValue": cents,
                    "interest": 0,
                    "fine": 0,
                    "fee": 0,
                    "discount": 0,
                },
                "percentage": pct,
                "dueDate": str(due),
                "expectedPaymentDate": str(due),
                "description": f"Parcela {i}/{n}",
                "paymentMethod": None,
                "financialAccount": None,
                "nsu": None,
                "paid": 0,
            }
        )

    external_reference = args.external_reference or f"cli-{uuid.uuid4().hex[:10]}"

    payload = {
        "competenceDate": competence_date,
        "externalReference": external_reference,
        "negotiatorId": args.negotiator_id,
        "reference": {"origin": "FINANCIAL_ENTRY"},
        "status": "PENDING",
        "value": cents_total,
        "categoriesRatio": [
            {
                "categoryId": args.category_id,
                "percentage": 100,
                "netValue": 0,
                "type": "DEFAULT",
                "operationType": "DEFAULT",
                "negative": False,
                "grossValue": cents_total,
                "value": cents_total,
                "costCentersRatio": [],
            }
        ],
        "type": kind,
        "description": args.description,
        "paymentCondition": {
            "value": cents_total,
            "daysBetweenInstallments": args.interval_days if n > 1 else 0,
            "numberOfInstallments": n,
            "initialDueDate": str(first_due),
            "financialAccountId": None,
            "paymentMethod": None,
            "installments": installments,
            "lumpSum": n == 1,
            "nsu": None,
        },
        "observation": args.observation,
        "attachments": [],
        "recurrence": {
            "active": False,
            "recurrenceDue": {
                "dueReferenceDayType": "MONTH_DAY",
                "dueMonthDay": f"{first_due.day:02d}",
                "dueWeekDay": first_due.strftime("%A").upper(),
                "firstDueDate": str(first_due),
            },
        },
        "source": "WEBAPP",
        "paymentConditionsOperation": "CREATE",
        "negotiatorName": args.negotiator_name or "",
    }
    return payload


def cmd_create_receivable(ctx: AuthContext, args: argparse.Namespace) -> None:
    payload = _build_event_payload(args, "REVENUE")
    r = req(ctx, "POST", "/finance-pro/v1/financial-events", json_body=payload)
    if r.status_code != 201:
        die_response(r)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))


def cmd_create_payable(ctx: AuthContext, args: argparse.Namespace) -> None:
    payload = _build_event_payload(args, "EXPENSE")
    r = req(ctx, "POST", "/finance-pro/v1/financial-events", json_body=payload)
    if r.status_code != 201:
        die_response(r)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))


def cmd_list_installments(ctx: AuthContext, args: argparse.Namespace) -> None:
    body = {
        "dueDateFrom": args.due_from,
        "dueDateTo": args.due_to,
        "quickFilter": args.quick_filter,
        "search": args.search,
        "type": args.type,
    }
    params = {"page": args.page, "page_size": args.page_size}
    r = req(ctx, "POST", "/finance-pro-reader/v1/installment-view", params=params, json_body=body)
    if r.status_code != 200:
        die_response(r)
    payload = r.json()
    if args.raw:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print(f"totalItems: {payload.get('totalItems', 0)}")
    for it in payload.get("items", []):
        due = it.get("dueDate")
        status = it.get("status")
        val = it.get("unpaid")
        idx = it.get("index")
        iid = it.get("id")
        desc = it.get("description")
        print(f"- {due} | {status} | R$ {val} | #{idx} | {desc} | {iid}")


def cmd_create_fin_account(ctx: AuthContext, args: argparse.Namespace) -> None:
    payload = {
        "bankInstitutionCode": args.bank_code,
        "agency": args.agency,
        "account": args.account,
        "name": args.name,
        "entityType": args.entity_type,
        "defaultAccount": args.default,
        "initialBalanceDate": args.initial_balance_date or str(dt.date.today()),
        "initialBalance": args.initial_balance,
        "type": args.type,
        "active": True,
    }
    r = req(ctx, "POST", "/app/financial-accounts", json_body=payload)
    if r.status_code != 200:
        die_response(r)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))


def cmd_acquit(ctx: AuthContext, args: argparse.Namespace) -> None:
    date = args.date or str(dt.date.today())
    payload = {
        "acquittanceDate": date,
        "availableDate": date,
        "paymentMethod": args.payment_method,
        "valueComposition": {
            "grossValue": args.amount,
            "interest": args.interest,
            "fine": args.fine,
            "discount": args.discount,
            "fee": args.fee,
        },
        "attachments": [],
        "observation": args.observation,
        "nsu": None,
        "financialAccountId": args.financial_account_id,
    }
    r = req(ctx, "POST", f"/finance-pro/v1/installments/{args.installment_id}/acquittances", json_body=payload)
    if r.status_code != 201:
        die_response(r)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))


def cmd_get_installment(ctx: AuthContext, args: argparse.Namespace) -> None:
    r = req(ctx, "GET", f"/finance-pro/v1/installments/{args.installment_id}")
    if r.status_code != 200:
        die_response(r)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))


def cmd_receipt(ctx: AuthContext, args: argparse.Namespace) -> None:
    r = req(ctx, "GET", f"/finance-pro-reports/v1/installment-receipt/{args.installment_id}")
    if r.status_code != 200:
        die_response(r)

    content_type = r.headers.get("content-type", "")
    if "application/pdf" not in content_type:
        die_response(r)

    out = args.out or f"recibo-{args.installment_id}.pdf"
    with open(out, "wb") as f:
        f.write(r.content)
    print(out)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Conta Azul internal API helper (HAR-auth)")
    p.add_argument("--har", default=os.getenv("CONTAAZUL_HAR"), help="Path para HAR com sessão logada")

    sub = p.add_subparsers(dest="cmd", required=True)

    # create-client
    s = sub.add_parser("create-client")
    s.add_argument("--name", required=True)
    s.add_argument("--cpf", required=True)
    s.add_argument("--email")
    s.add_argument("--observation", default=None)
    s.set_defaults(func=cmd_create_client)

    # create-fin-account
    s = sub.add_parser("create-fin-account")
    s.add_argument("--name", required=True)
    s.add_argument("--bank-code", type=int, default=479)
    s.add_argument("--agency", default="0001")
    s.add_argument("--account", required=True)
    s.add_argument("--entity-type", default="LEGAL", choices=["LEGAL", "PHYSICAL"])
    s.add_argument("--type", default="CHECKINGACCOUNT")
    s.add_argument("--default", action="store_true")
    s.add_argument("--initial-balance", type=float, default=0)
    s.add_argument("--initial-balance-date")
    s.set_defaults(func=cmd_create_fin_account)

    # create receivable / payable common args
    def add_event_args(sp):
        sp.add_argument("--negotiator-id", required=True)
        sp.add_argument("--negotiator-name")
        sp.add_argument("--category-id", required=True)
        sp.add_argument("--description", required=True)
        sp.add_argument("--value", type=float, required=True, help="Valor em reais")
        sp.add_argument("--due-date", required=True, help="YYYY-MM-DD")
        sp.add_argument("--installments", type=int, default=1)
        sp.add_argument("--interval-days", type=int, default=30)
        sp.add_argument("--competence-date")
        sp.add_argument("--external-reference")
        sp.add_argument("--observation", default=None)

    s = sub.add_parser("create-receivable")
    add_event_args(s)
    s.set_defaults(func=cmd_create_receivable)

    s = sub.add_parser("create-payable")
    add_event_args(s)
    s.set_defaults(func=cmd_create_payable)

    # list-installments
    s = sub.add_parser("list-installments")
    s.add_argument("--type", choices=["REVENUE", "EXPENSE"], required=True)
    s.add_argument("--due-from", required=True)
    s.add_argument("--due-to", required=True)
    s.add_argument("--search", default="")
    s.add_argument("--quick-filter", default="ALL")
    s.add_argument("--page", type=int, default=1)
    s.add_argument("--page-size", type=int, default=50)
    s.add_argument("--raw", action="store_true")
    s.set_defaults(func=cmd_list_installments)

    # acquit
    s = sub.add_parser("acquit", help="Marcar parcela como recebida/paga")
    s.add_argument("--installment-id", required=True)
    s.add_argument("--financial-account-id", required=True)
    s.add_argument("--amount", type=float, required=True, help="valor bruto em reais")
    s.add_argument("--date")
    s.add_argument(
        "--payment-method",
        default=None,
        choices=[
            None,
            "CASH",
            "CREDIT_CARD",
            "BANKING_BILLET",
            "PAYMENT_LINK",
            "CHECK",
            "DEBIT_CARD",
            "BANKING_TRANSFER",
            "OTHER",
            "DIGITAL_WALLET",
            "CASHBACK",
            "STORE_CREDIT",
        ],
    )
    s.add_argument("--interest", type=float, default=0)
    s.add_argument("--fine", type=float, default=0)
    s.add_argument("--discount", type=float, default=0)
    s.add_argument("--fee", type=float, default=0)
    s.add_argument("--observation", default=None)
    s.set_defaults(func=cmd_acquit)

    # get-installment
    s = sub.add_parser("get-installment")
    s.add_argument("--installment-id", required=True)
    s.set_defaults(func=cmd_get_installment)

    # receipt
    s = sub.add_parser("receipt")
    s.add_argument("--installment-id", required=True)
    s.add_argument("--out")
    s.set_defaults(func=cmd_receipt)

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.har:
        raise SystemExit("Passe --har /caminho/arquivo.har (ou defina CONTAAZUL_HAR).")

    ctx = auth_from_har(args.har)
    args.func(ctx, args)


if __name__ == "__main__":
    main()
