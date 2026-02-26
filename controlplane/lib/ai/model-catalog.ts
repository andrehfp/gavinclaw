export type ChatModelCapabilities = {
  acceptsFiles: boolean;
  acceptsText: boolean;
  canToolCall: boolean;
  hasVision: boolean;
  reasoning: boolean;
};

export type ChatModelOption = {
  capabilities: ChatModelCapabilities;
  id: string;
  label: string;
  provider: 'openai' | 'anthropic' | 'google' | 'openrouter';
};

// Capabilities verified against https://models.dev on 2026-02-25.
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'openrouter:openai/gpt-4.1-mini',
    label: 'OpenRouter GPT-4.1 Mini',
    provider: 'openrouter',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openrouter:anthropic/claude-sonnet-4.5',
    label: 'OpenRouter Claude Sonnet 4.5',
    provider: 'openrouter',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openrouter:google/gemini-2.5-flash',
    label: 'OpenRouter Gemini 2.5 Flash',
    provider: 'openrouter',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openrouter:google/gemini-2.5-pro',
    label: 'OpenRouter Gemini 2.5 Pro',
    provider: 'openrouter',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openrouter:openai/gpt-5-mini',
    label: 'OpenRouter GPT-5 Mini',
    provider: 'openrouter',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openrouter:anthropic/claude-3.7-sonnet',
    label: 'OpenRouter Claude 3.7 Sonnet',
    provider: 'openrouter',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'openai:gpt-5.2',
    label: 'OpenAI GPT-5.2 (Instant)',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: false, hasVision: true, reasoning: false },
    id: 'openai:gpt-image-1.5',
    label: 'OpenAI GPT ImageGen 1.5',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openai:gpt-5.2-pro',
    label: 'OpenAI GPT-5.2 (Reasoning)',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'openai:gpt-5-mini',
    label: 'OpenAI GPT-5 Mini',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: false, hasVision: false, reasoning: true },
    id: 'openai:gpt-oss-20b',
    label: 'OpenAI GPT OSS 20B',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: false, hasVision: false, reasoning: true },
    id: 'openai:gpt-oss-120b',
    label: 'OpenAI GPT OSS 120B',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'openai:gpt-4.1-mini',
    label: 'OpenAI GPT-4.1 Mini',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'openai:gpt-4.1',
    label: 'OpenAI GPT-4.1',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: false, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'openai:gpt-4o-mini',
    label: 'OpenAI GPT-4o Mini',
    provider: 'openai',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'anthropic:claude-3-7-sonnet-latest',
    label: 'Anthropic Claude 3.7 Sonnet',
    provider: 'anthropic',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'anthropic:claude-3-5-haiku-latest',
    label: 'Anthropic Claude 3.5 Haiku',
    provider: 'anthropic',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: false },
    id: 'google:gemini-2.0-flash',
    label: 'Google Gemini 2.0 Flash',
    provider: 'google',
  },
  {
    capabilities: { acceptsFiles: true, acceptsText: true, canToolCall: true, hasVision: true, reasoning: true },
    id: 'google:gemini-2.5-pro',
    label: 'Google Gemini 2.5 Pro',
    provider: 'google',
  },
];

export const DEFAULT_CHAT_MODEL = CHAT_MODEL_OPTIONS[0].id;
export const MODEL_STORAGE_KEY = 'controlplane-chat-model';

function normalizeModelId(modelId?: string): string | null {
  const resolvedModel = (modelId ?? DEFAULT_CHAT_MODEL).trim();
  if (!resolvedModel) {
    return null;
  }

  return resolvedModel;
}

export function getChatModelOption(modelId?: string): ChatModelOption | null {
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) {
    return null;
  }

  return CHAT_MODEL_OPTIONS.find((model) => model.id === normalizedModelId) ?? null;
}

export function modelSupportsToolCalling(modelId?: string): boolean {
  return getChatModelOption(modelId)?.capabilities.canToolCall ?? false;
}

export function modelSupportsReasoning(modelId?: string): boolean {
  return getChatModelOption(modelId)?.capabilities.reasoning ?? false;
}
