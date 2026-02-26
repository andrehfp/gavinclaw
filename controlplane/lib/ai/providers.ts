import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/model-catalog';

function requireEnv(name: string, providerLabel: string): void {
  if (!process.env[name]) {
    throw new Error(`${name} is required to use ${providerLabel} models`);
  }
}

let openrouterProvider: ReturnType<typeof createOpenAI> | null = null;

function getOpenRouterProvider() {
  requireEnv('OPENROUTER_API_KEY', 'OpenRouter');

  if (openrouterProvider) {
    return openrouterProvider;
  }

  const headers: Record<string, string> = {};
  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
  }

  openrouterProvider = createOpenAI({
    name: 'openrouter',
    baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  return openrouterProvider;
}

export function getChatModel(modelId?: string) {
  const resolvedModel = (modelId ?? process.env.AI_CHAT_MODEL ?? DEFAULT_CHAT_MODEL).trim() || DEFAULT_CHAT_MODEL;
  const [providerPart, ...modelParts] = resolvedModel.split(':');

  if (modelParts.length === 0) {
    requireEnv('OPENAI_API_KEY', 'OpenAI');
    return openai.responses(providerPart);
  }

  const provider = providerPart.toLowerCase();
  const providerModelId = modelParts.join(':');

  if (provider === 'openai') {
    requireEnv('OPENAI_API_KEY', 'OpenAI');
    return openai.responses(providerModelId);
  }

  if (provider === 'anthropic') {
    requireEnv('ANTHROPIC_API_KEY', 'Anthropic');
    return anthropic(providerModelId);
  }

  if (provider === 'google') {
    requireEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'Google');
    return google(providerModelId);
  }

  if (provider === 'openrouter') {
    return getOpenRouterProvider().chat(providerModelId);
  }

  throw new Error(`Unsupported provider "${provider}" in model id "${resolvedModel}"`);
}
