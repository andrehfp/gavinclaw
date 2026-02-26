import type { UIMessage } from 'ai';
import { getToolState } from '@/lib/chat/message-parts';

export function shouldAutoContinueAfterApproval(messages: UIMessage[]): boolean {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return false;
  }

  return (
    lastMessage.parts.some((part) => {
      const state = getToolState(part);
      if (state !== 'approval-responded') {
        return false;
      }
      if (!part || typeof part !== 'object') {
        return false;
      }
      const approval = (part as Record<string, unknown>).approval;
      if (!approval || typeof approval !== 'object') {
        return false;
      }
      return (approval as { approved?: boolean }).approved === true;
    }) ?? false
  );
}

