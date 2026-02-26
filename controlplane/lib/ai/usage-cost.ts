import type { LanguageModelUsage } from 'ai';

type ExtractedCost = {
  costUsd: number | null;
  source: string | null;
};

type ProviderCostInput = {
  usage: LanguageModelUsage;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
  providerMetadata?: unknown;
};

const COST_HEADER_CANDIDATES = [
  'x-openrouter-cost',
  'x-openrouter-total-cost',
  'x-openrouter-api-cost',
  'x-openrouter-credits-spent',
  'openrouter-cost',
] as const;

const COST_PATH_CANDIDATES = [
  'cost',
  'total_cost',
  'cost_usd',
  'total_cost_usd',
  'usd_cost',
  'usage.cost',
  'usage.total_cost',
  'usage.cost_usd',
  'usage.total_cost_usd',
  'pricing.cost',
  'pricing.total_cost',
  'billing.cost',
  'billing.total_cost',
  'meta.cost',
  'meta.total_cost',
  'data.cost',
  'data.total_cost',
  'openrouter.cost',
  'openrouter.total_cost',
] as const;

function toFiniteNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = Number(trimmed);
  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }

  const normalized = trimmed.replace(/[$,]/g, '');
  const parsed = Number(normalized);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  const matched = normalized.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
  if (!matched) {
    return null;
  }

  const extracted = Number(matched[0]);
  return Number.isFinite(extracted) && extracted >= 0 ? extracted : null;
}

function readPath(input: unknown, path: string): unknown {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const segments = path.split('.');
  let current: unknown = input;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractCostFromObject(input: unknown, sourceLabel: string): ExtractedCost {
  if (!input || typeof input !== 'object') {
    return { costUsd: null, source: null };
  }

  for (const path of COST_PATH_CANDIDATES) {
    const value = readPath(input, path);
    const parsed = toFiniteNonNegativeNumber(value);
    if (parsed !== null) {
      return {
        costUsd: parsed,
        source: `${sourceLabel}.${path}`,
      };
    }
  }

  return { costUsd: null, source: null };
}

export function extractProviderReportedCostUsd({
  usage,
  responseBody,
  responseHeaders,
  providerMetadata,
}: ProviderCostInput): ExtractedCost {
  if (responseHeaders) {
    for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
      const normalizedName = headerName.toLowerCase();
      if (!COST_HEADER_CANDIDATES.includes(normalizedName as (typeof COST_HEADER_CANDIDATES)[number])) {
        continue;
      }

      const parsed = toFiniteNonNegativeNumber(headerValue);
      if (parsed !== null) {
        return {
          costUsd: parsed,
          source: `response.headers.${normalizedName}`,
        };
      }
    }
  }

  const candidates: Array<{ data: unknown; label: string }> = [
    { data: usage.raw, label: 'usage.raw' },
    { data: responseBody, label: 'response.body' },
    { data: providerMetadata, label: 'providerMetadata' },
  ];

  for (const candidate of candidates) {
    const extracted = extractCostFromObject(candidate.data, candidate.label);
    if (extracted.costUsd !== null) {
      return extracted;
    }
  }

  return { costUsd: null, source: null };
}
