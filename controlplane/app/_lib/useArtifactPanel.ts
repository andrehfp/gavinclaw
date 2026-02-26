'use client';

import type { DataUIPart } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactDetail, ArtifactKind, ArtifactSummary, ArtifactVersion } from '@/lib/chat/artifacts';
import { applyArtifactDataPart, initialArtifactStreamState, type ArtifactStreamState } from '@/lib/chat/artifact-state';
import type { ChatMessageDataParts } from '@/lib/chat/types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return value === 'text' || value === 'code';
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function parseArtifactSummary(value: unknown): ArtifactSummary | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asNonEmptyString(value.id);
  const conversationId = asNonEmptyString(value.conversationId);
  const title = asNonEmptyString(value.title);
  const kind = isArtifactKind(value.kind) ? value.kind : null;
  const status = value.status === 'active' || value.status === 'archived' ? value.status : null;
  const latestVersion = asNumber(value.latestVersion);
  const createdAt = asNumber(value.createdAt);
  const updatedAt = asNumber(value.updatedAt);

  if (!id || !conversationId || !title || !kind || !status || latestVersion === null || createdAt === null || updatedAt === null) {
    return null;
  }

  return {
    id,
    conversationId,
    title,
    kind,
    status,
    latestVersion,
    createdAt,
    updatedAt,
  };
}

function parseArtifactDetail(value: unknown): ArtifactDetail | null {
  const summary = parseArtifactSummary(value);
  if (!summary || !isObject(value)) {
    return null;
  }

  const content = typeof value.content === 'string' ? value.content : null;
  return {
    ...summary,
    content,
  };
}

function parseArtifactVersion(value: unknown): ArtifactVersion | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asNonEmptyString(value.id);
  const artifactId = asNonEmptyString(value.artifactId);
  const version = asNumber(value.version);
  const content = typeof value.content === 'string' ? value.content : null;
  const createdAt = asNumber(value.createdAt);
  const changeSummary = typeof value.changeSummary === 'string' ? value.changeSummary : null;

  if (!id || !artifactId || version === null || content === null || createdAt === null) {
    return null;
  }

  return {
    id,
    artifactId,
    version,
    content,
    createdAt,
    changeSummary,
  };
}

type UseArtifactPanelInput = {
  conversationId: string | null;
};

export function useArtifactPanel({ conversationId }: UseArtifactPanelInput) {
  const [streamState, setStreamState] = useState<ArtifactStreamState>(initialArtifactStreamState);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactDetail | null>(null);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const streamStateRef = useRef(streamState);

  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  const resetState = useCallback(() => {
    listRequestIdRef.current += 1;
    detailRequestIdRef.current += 1;
    setStreamState(initialArtifactStreamState);
    setArtifacts([]);
    setActiveArtifact(null);
    setVersions([]);
    setErrorMessage(null);
    setIsLoadingArtifacts(false);
    setIsLoadingArtifact(false);
  }, []);

  const refreshArtifacts = useCallback(async () => {
    if (!conversationId) {
      setArtifacts([]);
      return;
    }

    const requestId = ++listRequestIdRef.current;
    setIsLoadingArtifacts(true);

    try {
      const response = await fetch(
        `/api/protected/conversations/${encodeURIComponent(conversationId)}/artifacts`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('Could not load artifacts');
      }

      const payload = (await response.json()) as { artifacts?: unknown[] };
      const parsedArtifacts = Array.isArray(payload.artifacts)
        ? payload.artifacts
            .map((artifact) => parseArtifactSummary(artifact))
            .filter((artifact): artifact is ArtifactSummary => artifact !== null)
        : [];

      if (requestId !== listRequestIdRef.current) {
        return;
      }

      setArtifacts(parsedArtifacts);
    } catch (error) {
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while loading artifacts');
    } finally {
      if (requestId === listRequestIdRef.current) {
        setIsLoadingArtifacts(false);
      }
    }
  }, [conversationId]);

  const loadArtifact = useCallback(
    async (artifactId: string) => {
      if (!conversationId) {
        return;
      }

      const requestId = ++detailRequestIdRef.current;
      setIsLoadingArtifact(true);
      setErrorMessage(null);

      try {
        const encodedConversationId = encodeURIComponent(conversationId);
        const encodedArtifactId = encodeURIComponent(artifactId);
        const [artifactResponse, versionsResponse] = await Promise.all([
          fetch(
            `/api/protected/conversations/${encodedConversationId}/artifacts/${encodedArtifactId}`,
            { cache: 'no-store' },
          ),
          fetch(
            `/api/protected/conversations/${encodedConversationId}/artifacts/${encodedArtifactId}/versions`,
            { cache: 'no-store' },
          ),
        ]);

        if (!artifactResponse.ok) {
          throw new Error('Could not load artifact');
        }
        if (!versionsResponse.ok) {
          throw new Error('Could not load artifact versions');
        }

        const artifactPayload = (await artifactResponse.json()) as { artifact?: unknown };
        const versionsPayload = (await versionsResponse.json()) as { versions?: unknown[] };
        const parsedArtifact = parseArtifactDetail(artifactPayload.artifact);
        const parsedVersions = Array.isArray(versionsPayload.versions)
          ? versionsPayload.versions
              .map((version) => parseArtifactVersion(version))
              .filter((version): version is ArtifactVersion => version !== null)
          : [];

        if (requestId !== detailRequestIdRef.current) {
          return;
        }

        if (!parsedArtifact) {
          throw new Error('Artifact payload is invalid');
        }

        setActiveArtifact(parsedArtifact);
        setVersions(parsedVersions);
      } catch (error) {
        if (requestId !== detailRequestIdRef.current) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while loading artifact');
      } finally {
        if (requestId === detailRequestIdRef.current) {
          setIsLoadingArtifact(false);
        }
      }
    },
    [conversationId],
  );

  useEffect(() => {
    if (!conversationId) {
      resetState();
      return;
    }

    resetState();
    void refreshArtifacts();
  }, [conversationId, refreshArtifacts, resetState]);

  const selectArtifact = useCallback(
    (artifactId: string) => {
      const selectedArtifact = artifacts.find((artifact) => artifact.id === artifactId) ?? null;

      setStreamState((current) => ({
        ...current,
        activeArtifactId: artifactId,
        activeKind: selectedArtifact?.kind ?? current.activeKind,
        activeTitle: selectedArtifact?.title ?? current.activeTitle,
        isOpen: true,
        isStreaming: false,
        streamingContent: '',
      }));
      setActiveArtifact(null);
      setVersions([]);
      void loadArtifact(artifactId);
    },
    [artifacts, loadArtifact],
  );

  const closePanel = useCallback(() => {
    setStreamState((current) => ({
      ...current,
      isOpen: false,
      isStreaming: false,
    }));
  }, []);

  const openPanel = useCallback(() => {
    setStreamState((current) => ({
      ...current,
      isOpen: true,
    }));
  }, []);

  const handleDataPart = useCallback(
    (part: DataUIPart<ChatMessageDataParts>) => {
      setStreamState((current) => applyArtifactDataPart(current, part));

      if (part.type === 'data-id') {
        const artifactId = asNonEmptyString(part.data);
        if (artifactId) {
          setActiveArtifact(null);
          setVersions([]);
          void loadArtifact(artifactId);
        }
      }

      if (part.type === 'data-finish') {
        const payload = isObject(part.data) ? part.data : null;
        const artifactIdFromPayload = payload ? asNonEmptyString(payload.artifactId) : null;
        const artifactId = artifactIdFromPayload ?? streamStateRef.current.activeArtifactId;

        if (artifactId) {
          void Promise.all([refreshArtifacts(), loadArtifact(artifactId)]);
        } else {
          void refreshArtifacts();
        }
      }
    },
    [loadArtifact, refreshArtifacts],
  );

  const activeArtifactId = streamState.activeArtifactId;
  const isStreaming = streamState.isStreaming;
  const activeContent = useMemo(() => {
    if (isStreaming) {
      if (streamState.streamingContent.length > 0) {
        return streamState.streamingContent;
      }
      return activeArtifact?.content ?? '';
    }

    return activeArtifact?.content ?? '';
  }, [activeArtifact?.content, isStreaming, streamState.streamingContent]);

  const activeKind = useMemo<ArtifactKind | null>(() => {
    return streamState.activeKind ?? activeArtifact?.kind ?? null;
  }, [activeArtifact?.kind, streamState.activeKind]);

  const activeTitle = useMemo(() => {
    return streamState.activeTitle || activeArtifact?.title || 'Artifact';
  }, [activeArtifact?.title, streamState.activeTitle]);

  return {
    activeArtifact,
    activeArtifactId,
    activeContent,
    activeKind,
    activeTitle,
    artifacts,
    closePanel,
    errorMessage,
    handleDataPart,
    isLoadingArtifact,
    isLoadingArtifacts,
    isOpen: streamState.isOpen,
    isStreaming,
    openPanel,
    refreshArtifacts,
    selectArtifact,
    versions,
  };
}
