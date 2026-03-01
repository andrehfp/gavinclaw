# 004 - Tool Reform Findings (Live Probe)

## Scope
Live probe executed against active Conta Azul integration (tenant_id=2), calling all 41 registered tools with representative inputs.

Raw report:
- `tmp/tool_reform_probe.json`

## Summary
- Total tools tested: **41**
- `ok`: **17**
- `error`: **24**
- `raised/thrown`: **0**

## What is healthy
These tools completed successfully with valid representative inputs:
- `crm.list_people`
- `crm.get_person`
- `crm.get_person_by_legacy_id`
- `crm.activate_people`
- `crm.inactivate_people`
- `finance.list_installments`
- `finance.get_statement`
- `finance.list_receivables`
- `finance.list_payables`
- `finance.list_categories`
- `finance.list_dre_categories`
- `finance.list_cost_centers`
- `finance.list_financial_accounts`
- `inventory.list_products`
- `service.list`
- `service.get`
- `acquittance.list`

## Reform needed (high priority)

### 1) Missing local validation before calling Conta Azul
Many tools depend on remote API 400s instead of local argument checks.
Examples:
- `crm.create_client`, `crm.create_person`
- `finance.create_cost_center`
- `inventory.create_product`
- `service.create`, `service.delete_batch`

**Reform:** Add per-tool required-field validation from `Cazu.Tools.Specs` before `ContaAzul.request/4`, returning structured local errors.

---

### 2) Invoice date-range constraints are not encoded in tool layer
`invoice.list` and `invoice.list_service` fail for large ranges (API enforces max 15 days).
- 1-year range => 400
- 15-day range => OK

**Reform:** Enforce/auto-chunk date windows (<=15 days) in tool layer and normalize date aliases.

---

### 3) `charge.create` lacks account-type guardrails
Even with valid shape args, API returned:
- "tipo de conta selecionado não é válido para criação de cobrança"

**Reform:** Validate/resolve `conta_bancaria` from financial accounts compatible with charge generation before POST.

---

### 4) `crm.update_person` semantics are brittle
`update_person` (PUT) with partial payload produced validation error requiring `tipo_pessoa`.
`patch_person` behaves better for partial updates.

**Reform:**
- either enforce full payload requirements on `update_person`
- or route partial updates to PATCH internally.

---

### 5) Spec/behavior mismatch in service delete IDs
`service.delete_batch` spec allows string/int, but API rejected string id as invalid int64.

**Reform:** tighten spec + normalization to int64 list (or clearer error mapping).

## Reform needed (medium priority)

### 6) Preflight for business rules with clearer UX errors
- `acquittance.create`: payment date must be <= today
- `inventory.delete_product`: cannot delete products with movements

**Reform:** map frequent business-rule failures to friendly actionable errors before or after API call.

---

### 7) Standardized error mapping
Several endpoints return heterogeneous 400/404 payload formats.

**Reform:** normalize connector/tool errors into one internal contract:
- `:validation_error`
- `:not_found`
- `:reauth_required`
- `:transient_failure`
- `:provider_failure`

## Suggested implementation order
1. Local pre-validation against specs (required fields/types)
2. Invoice range guard/chunking
3. Charge account compatibility pre-check
4. CRM PUT/PATCH consistency
5. Spec alignment (`service.delete_batch` id type)
6. Unified error normalization + user-facing messages
