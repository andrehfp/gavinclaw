import type { UIMessage } from 'ai';
import type { ArtifactKind } from '@/lib/chat/artifacts';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessageDataParts = {
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: {
    artifactId: string;
    version: number;
  };
  textDelta: string;
  codeDelta: string;
  artifactContext: {
    artifactId: string;
    title: string;
    kind: ArtifactKind;
    content: string;
  };
};

export type ChatMessage = UIMessage<unknown, ChatMessageDataParts>;

export type StoredConversationMessage = {
  id: string;
  role: ChatRole;
  parts: unknown[];
  content: string;
  redacted: boolean;
  createdAt: number;
  attachments: unknown[];
};
