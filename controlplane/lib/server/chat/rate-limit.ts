import { api } from '@/convex/_generated/api';
import { ApiError, type ProtectedContext } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const DEFAULT_WINDOW_MINUTES = 60;
const DEFAULT_MAX_MESSAGES = 40;

export async function assertChatRateLimit(context: ProtectedContext): Promise<void> {
  const windowMinutes = envNumber('AI_CHAT_RATE_LIMIT_WINDOW_MINUTES', DEFAULT_WINDOW_MINUTES);
  const maxMessages = envNumber('AI_CHAT_MAX_USER_MESSAGES_PER_WINDOW', DEFAULT_MAX_MESSAGES);
  const windowStart = Date.now() - windowMinutes * 60 * 1000;

  const client = getServerConvexClient(context.accessToken);
  const messageCount = await client.query(api.messages.countRecentUserMessagesByActor, {
    windowStart,
  });

  if (messageCount >= maxMessages) {
    throw new ApiError(
      429,
      'RATE_LIMITED',
      `Message limit reached (${maxMessages} messages/${windowMinutes}m). Try again shortly.`,
    );
  }
}

