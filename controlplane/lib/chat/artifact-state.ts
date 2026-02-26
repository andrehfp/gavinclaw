import type { DataUIPart } from 'ai';
import type { ChatMessageDataParts } from '@/lib/chat/types';
import type { ArtifactKind } from './artifacts';

export type ArtifactStreamState = {
  activeArtifactId: string | null;
  activeKind: ArtifactKind | null;
  activeTitle: string;
  isOpen: boolean;
  isStreaming: boolean;
  streamingContent: string;
};

export const initialArtifactStreamState: ArtifactStreamState = {
  activeArtifactId: null,
  activeKind: null,
  activeTitle: '',
  isOpen: false,
  isStreaming: false,
  streamingContent: '',
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asArtifactKind(value: unknown): ArtifactKind | null {
  if (value === 'text' || value === 'code') {
    return value;
  }
  return null;
}

export function applyArtifactDataPart(
  state: ArtifactStreamState,
  part: DataUIPart<ChatMessageDataParts>,
): ArtifactStreamState {
  switch (part.type) {
    case 'data-id': {
      const artifactId = asString(part.data);
      if (!artifactId) {
        return state;
      }

      return {
        ...state,
        activeArtifactId: artifactId,
        isOpen: true,
        isStreaming: true,
      };
    }
    case 'data-title': {
      const title = asString(part.data);
      if (!title) {
        return state;
      }

      return {
        ...state,
        activeTitle: title,
        isOpen: true,
      };
    }
    case 'data-kind': {
      const kind = asArtifactKind(part.data);
      if (!kind) {
        return state;
      }

      return {
        ...state,
        activeKind: kind,
        isOpen: true,
      };
    }
    case 'data-clear':
      return {
        ...state,
        isOpen: true,
        isStreaming: true,
        streamingContent: '',
      };
    case 'data-textDelta':
    case 'data-codeDelta': {
      const delta = typeof part.data === 'string' ? part.data : '';
      if (!delta) {
        return state;
      }

      return {
        ...state,
        isOpen: true,
        isStreaming: true,
        streamingContent: `${state.streamingContent}${delta}`,
      };
    }
    case 'data-finish':
      return {
        ...state,
        isOpen: true,
        isStreaming: false,
      };
    default:
      return state;
  }
}
