export class ChatPipelineError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const STREAM_ERROR_FALLBACK = 'The assistant could not complete this response.';
const MISSING_PROVIDER_KEY_PATTERN = /^[A-Z0-9_]+ is required to use (OpenAI|Anthropic|Google|OpenRouter) models$/;

export function toChatPipelineError(error: unknown): ChatPipelineError {
  if (error instanceof ChatPipelineError) {
    return error;
  }

  if (error instanceof Error) {
    if (
      error.message.includes('401') ||
      error.message.toLowerCase().includes('unauthorized') ||
      error.message.toLowerCase().includes('authentication')
    ) {
      return new ChatPipelineError(401, 'AI_UNAUTHORIZED', 'AI provider rejected authentication');
    }

    if (error.message.includes('429') || error.message.toLowerCase().includes('rate')) {
      return new ChatPipelineError(429, 'AI_RATE_LIMITED', 'AI provider rate limit reached');
    }

    return new ChatPipelineError(500, 'AI_PROVIDER_ERROR', error.message);
  }

  return new ChatPipelineError(500, 'AI_PROVIDER_ERROR', 'Unknown AI provider error');
}

export function toUserFacingStreamError(error: unknown): string {
  if (error instanceof Error) {
    const trimmedMessage = error.message.trim();
    if (MISSING_PROVIDER_KEY_PATTERN.test(trimmedMessage)) {
      return trimmedMessage;
    }
  }

  const pipelineError = toChatPipelineError(error);

  if (pipelineError.code === 'AI_UNAUTHORIZED') {
    return 'AI provider authentication failed for the selected model. Check the API key.';
  }

  if (pipelineError.code === 'AI_RATE_LIMITED') {
    return 'AI provider rate limit reached. Try again in a moment.';
  }

  // Keep production responses generic while surfacing actionable diagnostics in local dev.
  if (process.env.NODE_ENV === 'development' && pipelineError.code === 'AI_PROVIDER_ERROR') {
    return pipelineError.message || STREAM_ERROR_FALLBACK;
  }

  return STREAM_ERROR_FALLBACK;
}
