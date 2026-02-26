'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useArtifactPanel } from '@/app/_lib/useArtifactPanel';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitFork,
  Loader2,
  Moon,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { CopyToClipboardButton } from '@/components/chat/CopyToClipboardButton';
import { LandingSeven } from '@/components/landing/LandingSeven';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { ToolPartCard } from '@/components/chat/ToolPartCard';
import { CHAT_MODEL_OPTIONS as AVAILABLE_MODELS, DEFAULT_CHAT_MODEL, MODEL_STORAGE_KEY } from '@/lib/ai/model-catalog';
import { shouldAutoContinueAfterApproval } from '@/lib/chat/approval';
import {
  getFilePart,
  getReasoningFromParts,
  getTextFromParts,
  getToolState,
  hasVisibleAssistantContent,
  isImageMediaType,
  isToolPart,
  normalizeMessageParts,
} from '@/lib/chat/message-parts';
import { isScrolledNearBottom } from '@/lib/chat/scroll';
import {
  getAttachmentInputAccept,
  getUnsupportedAttachmentMessage,
  MAX_ATTACHMENTS_PER_MESSAGE,
  resolveAttachmentSupport,
  splitAttachmentsBySupport,
  extractFilesFromClipboardData,
  filesToUIParts,
  formatFileSize,
  validateAttachmentsForMessage,
} from '@/lib/chat/file-attachments';
import type { ChatMessage } from '@/lib/chat/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';

type Role = 'admin' | 'user';
type Theme = 'dark' | 'light';

type SessionContext = {
  actorUserId: string;
  actorEmail: string | null;
  orgId: string;
  orgName: string;
  role: Role;
  conversationCount: number;
};

type ConversationFromApi = {
  id: string;
  title: string;
  status: 'open' | 'closed';
  createdAt: number;
  projectId?: string | null;
  forkedFromConversationId?: string | null;
  pinnedAt?: number | null;
};

type Conversation = {
  id: string;
  title: string;
  status: 'open' | 'closed';
  createdAt: number;
  projectId: string | null;
  forkedFromConversationId: string | null;
  pinnedAt: number | null;
};

type Project = {
  id: string;
  name: string;
  visibility: 'shared' | 'private';
  createdByUserId: string;
  createdAt: number;
};

type MessageFromApi = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts?: unknown[];
  content?: string;
  attachments?: unknown[];
  redacted: boolean;
  createdAt: number;
};

type CommandPaletteAction = {
  id: string;
  label: string;
  description: string;
  shortcut: string | null;
  disabled?: boolean;
  onSelect: () => void;
};

function pendingAttachmentId(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function formatAttachmentTitle(index: number, filename?: string): string {
  if (filename && filename.trim().length > 0) {
    return filename;
  }
  return `attachment-${index + 1}`;
}

function formatConversationTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitial(email: string | null, userId: string): string {
  if (email) return email[0]?.toUpperCase() ?? '?';
  return userId[0]?.toUpperCase() ?? '?';
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getAuthUserDisplayName(user: unknown): string | null {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const typedUser = user as Record<string, unknown>;
  const firstName = asNonEmptyString(typedUser.firstName);
  const lastName = asNonEmptyString(typedUser.lastName);
  const fullName = [firstName, lastName]
    .filter((part): part is string => part !== null)
    .join(' ')
    .trim();

  if (fullName.length > 0) {
    return fullName;
  }

  const email = asNonEmptyString(typedUser.email);
  if (email) {
    const localPart = email.split('@')[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  return null;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function readApiError(response: Response, fallback: string): Promise<{ code: string | null; message: string }> {
  try {
    const data = (await response.json()) as { error?: { code?: string; message?: string } };
    return {
      code: data.error?.code ?? null,
      message: data.error?.message ?? fallback,
    };
  } catch {
    return {
      code: null,
      message: fallback,
    };
  }
}

function toUiMessages(messages: MessageFromApi[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: normalizeMessageParts(message.parts, message.content) as ChatMessage['parts'],
  }));
}

function normalizeConversation(conversation: ConversationFromApi): Conversation {
  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status,
    createdAt: conversation.createdAt,
    projectId: conversation.projectId ?? null,
    forkedFromConversationId: conversation.forkedFromConversationId ?? null,
    pinnedAt: conversation.pinnedAt ?? null,
  };
}

function compareConversationsForSidebar(a: Conversation, b: Conversation): number {
  const pinnedDiff = (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  if (pinnedDiff !== 0) {
    return pinnedDiff;
  }

  const createdDiff = b.createdAt - a.createdAt;
  if (createdDiff !== 0) {
    return createdDiff;
  }

  return a.id.localeCompare(b.id);
}

function pickDefaultConversationId(items: readonly Conversation[]): string | null {
  const openConversation = items.find((item) => item.status === 'open');
  if (openConversation) {
    return openConversation.id;
  }

  return items[0]?.id ?? null;
}

const THREAD_AUTO_SCROLL_THRESHOLD_PX = 96;

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  return target.closest('[contenteditable="true"]') !== null;
}

function isQuestionMarkKeyEvent(event: KeyboardEvent): boolean {
  return event.key === '?' || (event.key === '/' && event.shiftKey);
}

export default function Home() {
  const { user, signOut, loading } = useAuth();

  const [theme, setTheme] = useState<Theme>('dark');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const artifactPanel = useArtifactPanel({ conversationId: selectedConversationId });
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState(DEFAULT_CHAT_MODEL);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [createProjectName, setCreateProjectName] = useState('');
  const [createProjectVisibility, setCreateProjectVisibility] = useState<'shared' | 'private'>('shared');
  const [createProjectErrorMessage, setCreateProjectErrorMessage] = useState<string | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [pinningConversationId, setPinningConversationId] = useState<string | null>(null);
  const [archivingConversationId, setArchivingConversationId] = useState<string | null>(null);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const [renameModalConversationId, setRenameModalConversationId] = useState<string | null>(null);
  const [renameDraftTitle, setRenameDraftTitle] = useState('');
  const [renameErrorMessage, setRenameErrorMessage] = useState<string | null>(null);
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(false);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set());
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [isMacLikePlatform, setIsMacLikePlatform] = useState(false);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedReasoningByMessageId, setExpandedReasoningByMessageId] = useState<Record<string, boolean>>({});
  const [isThreadNearBottom, setIsThreadNearBottom] = useState(true);

  const threadRef = useRef<HTMLElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const selectedChatModelRef = useRef<string>(selectedChatModel);
  const shouldAutoScrollRef = useRef(true);

  const canWrite = context !== null;
  const actorMessageLabel = useMemo(() => getAuthUserDisplayName(user) ?? 'User', [user]);
  const shadcnThemeClass = theme === 'dark' ? 'dark' : '';
  const dialogSurfaceClass =
    theme === 'dark' ? 'border-zinc-800 bg-zinc-950 text-zinc-100' : 'border-zinc-200 bg-white text-zinc-900';
  const dialogMutedClass = theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500';
  const dialogBorderClass = theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200';
  const activeConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status === 'open'),
    [conversations],
  );
  const archivedConversations = useMemo(
    () =>
      [...conversations]
        .filter((conversation) => conversation.status === 'closed')
        .sort(compareConversationsForSidebar),
    [conversations],
  );
  const groupedConversations = useMemo(() => {
    const visibleProjectIds = new Set(projects.map((project) => project.id));
    const byProject = new Map<string, Conversation[]>();
    projects.forEach((project) => byProject.set(project.id, []));

    const unfiled: Conversation[] = [];
    activeConversations.forEach((conversation) => {
      if (conversation.projectId && visibleProjectIds.has(conversation.projectId)) {
        byProject.get(conversation.projectId)?.push(conversation);
        return;
      }
      unfiled.push(conversation);
    });

    unfiled.sort(compareConversationsForSidebar);
    for (const [projectId, projectConversations] of byProject.entries()) {
      byProject.set(projectId, [...projectConversations].sort(compareConversationsForSidebar));
    }

    return {
      unfiled,
      byProject,
    };
  }, [activeConversations, projects]);
  const conversationOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    let rowNumber = 1;

    groupedConversations.unfiled.forEach((conversation) => {
      map.set(conversation.id, rowNumber);
      rowNumber += 1;
    });

    projects.forEach((project) => {
      const projectConversations = groupedConversations.byProject.get(project.id) ?? [];
      projectConversations.forEach((conversation) => {
        map.set(conversation.id, rowNumber);
        rowNumber += 1;
      });
    });

    archivedConversations.forEach((conversation) => {
      map.set(conversation.id, rowNumber);
      rowNumber += 1;
    });

    return map;
  }, [archivedConversations, groupedConversations, projects]);
  const selectedModelOption = useMemo(
    () => AVAILABLE_MODELS.find((model) => model.id === selectedChatModel) ?? AVAILABLE_MODELS[0] ?? null,
    [selectedChatModel],
  );
  const selectedModelAttachmentSupport = resolveAttachmentSupport({
    acceptsFiles: selectedModelOption?.capabilities.acceptsFiles ?? false,
    hasVision: selectedModelOption?.capabilities.hasVision ?? false,
  });
  const selectedModelSupportsAttachments = selectedModelAttachmentSupport !== 'none';
  const attachmentInputAccept = getAttachmentInputAccept(selectedModelAttachmentSupport);
  const selectedModelSupportsTools = selectedModelOption?.capabilities.canToolCall ?? false;
  const selectedConversationIsArchived = selectedConversationId
    ? conversations.some((conversation) => conversation.id === selectedConversationId && conversation.status === 'closed')
    : false;
  const canWriteToSelectedConversation = canWrite && Boolean(selectedConversationId) && !selectedConversationIsArchived;
  const keyboardModifierLabel = isMacLikePlatform ? 'Cmd' : 'Ctrl';
  const commandPaletteShortcutLabel = `${keyboardModifierLabel} + K`;
  const newChatShortcutLabel = 'Shift + N';
  const newProjectShortcutLabel = 'Shift + P';
  const toggleThemeShortcutLabel = 'Shift + T';
  const hasBlockingModalOpen =
    Boolean(renameModalConversationId) || isCreateProjectDialogOpen || isPreferencesOpen || isCommandPaletteOpen;

  const activeChatId = selectedConversationId ?? 'no-conversation-selected';
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: selectedConversationId
          ? `/api/protected/conversations/${encodeURIComponent(selectedConversationId)}/stream`
          : '/api/protected/conversations/__missing__/stream',
        prepareSendMessagesRequest(request) {
          const lastMessage = request.messages.at(-1);
          const isApprovalContinuation =
            lastMessage?.role !== 'user' ||
            request.messages.some((message) =>
              message.parts.some((part) => {
                const state = getToolState(part);
                return state === 'approval-responded' || state === 'output-denied';
              }),
            );

          return {
            body: {
              id: request.id,
              ...(isApprovalContinuation ? { messages: request.messages } : { message: lastMessage }),
              selectedChatModel: selectedChatModelRef.current,
            },
          };
        },
      }),
    [selectedConversationId],
  );

  const { messages, setMessages, sendMessage, addToolApprovalResponse, status, stop } = useChat<ChatMessage>({
    id: activeChatId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => shouldAutoContinueAfterApproval(currentMessages),
    onData: artifactPanel.handleDataPart,
    onError(error) {
      setErrorMessage(error.message || 'Chat streaming failed');
    },
  });
  const showScrollToBottomButton =
    selectedConversationId !== null && !isThreadLoading && messages.length > 0 && !isThreadNearBottom;

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    setPendingAttachments([]);
    setExpandedReasoningByMessageId({});
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  }, [selectedConversationId]);

  useEffect(() => {
    selectedChatModelRef.current = selectedChatModel;
  }, [selectedChatModel]);

  useEffect(() => {
    if (pendingAttachments.length === 0) {
      return;
    }

    const { accepted, rejected } = splitAttachmentsBySupport(
      pendingAttachments,
      selectedModelAttachmentSupport,
    );
    if (rejected.length === 0) {
      return;
    }

    setPendingAttachments(accepted);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
    setErrorMessage(getUnsupportedAttachmentMessage(selectedModelAttachmentSupport));
  }, [pendingAttachments, selectedModelAttachmentSupport]);

  useEffect(() => {
    const platform = window.navigator.platform.toLowerCase();
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsMacLikePlatform(
      platform.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod'),
    );
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('controlplane-theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);

    const savedSidebar = window.localStorage.getItem('controlplane-sidebar-collapsed');
    if (savedSidebar === '1') {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const savedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (!savedModel) {
      return;
    }

    const exists = AVAILABLE_MODELS.some((model) => model.id === savedModel);
    if (exists) {
      setSelectedChatModel(savedModel);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('controlplane-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('controlplane-sidebar-collapsed', isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedChatModel);
  }, [selectedChatModel]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [theme]);

  useEffect(() => {
    if (!isPreferencesOpen && !renameModalConversationId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (renamingConversationId) return;

      setIsPreferencesOpen(false);
      setRenameModalConversationId(null);
      setRenameDraftTitle('');
      setRenameErrorMessage(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPreferencesOpen, renameModalConversationId, renamingConversationId]);

  useEffect(() => {
    if (!renameModalConversationId) return;

    const frameId = window.requestAnimationFrame(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [renameModalConversationId]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    setIsThreadNearBottom(true);
  }, [selectedConversationId]);

  useEffect(() => {
    const threadElement = threadRef.current;
    if (!threadElement || !shouldAutoScrollRef.current) return;

    threadElement.scrollTop = threadElement.scrollHeight;
    setIsThreadNearBottom(true);
  }, [messages, status]);

  function handleThreadScroll(event: React.UIEvent<HTMLElement>) {
    const isNearBottom = isScrolledNearBottom(event.currentTarget, THREAD_AUTO_SCROLL_THRESHOLD_PX);
    shouldAutoScrollRef.current = isNearBottom;
    setIsThreadNearBottom((current) => (current === isNearBottom ? current : isNearBottom));
  }

  function handleScrollToBottom() {
    const threadElement = threadRef.current;
    if (!threadElement) return;

    shouldAutoScrollRef.current = true;
    setIsThreadNearBottom(true);
    threadElement.scrollTo({
      top: threadElement.scrollHeight,
      behavior: 'smooth',
    });
  }

  useEffect(() => {
    if (!user) {
      setContext(null);
      setProjects([]);
      setConversations([]);
      setSelectedConversationId(null);
      setActiveConversation(null);
      setInitialMessages([]);
      setMessages([]);
      setIsPreferencesOpen(false);
      setIsCreateProjectDialogOpen(false);
      setIsCreatingProject(false);
      setCreateProjectName('');
      setCreateProjectVisibility('shared');
      setCreateProjectErrorMessage(null);
      setRenamingConversationId(null);
      setPinningConversationId(null);
      setArchivingConversationId(null);
      setForkingMessageId(null);
      setRenameModalConversationId(null);
      setRenameDraftTitle('');
      setRenameErrorMessage(null);
      setIsCommandPaletteOpen(false);
      setCommandPaletteQuery('');
      setIsShortcutsHelpOpen(false);
      setIsArchivedSectionExpanded(false);
      setCollapsedProjectIds(new Set());
      setPendingAttachments([]);
      setIsPreparingAttachments(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);
      setErrorMessage(null);

      try {
        const contextResponse = await fetch('/api/protected/context', { cache: 'no-store' });

        if (!contextResponse.ok) {
          const contextError = await readApiError(contextResponse, 'Could not load session context');
          if (contextError.code === 'ORGANIZATION_SETUP_REQUIRED') {
            window.location.href = '/onboarding';
            return;
          }

          throw new Error(contextError.message);
        }

        const [projectsResponse, conversationsResponse] = await Promise.all([
          fetch('/api/protected/projects', { cache: 'no-store' }),
          fetch('/api/protected/conversations', { cache: 'no-store' }),
        ]);
        if (!projectsResponse.ok) {
          throw new Error(await readError(projectsResponse, 'Could not load projects'));
        }
        if (!conversationsResponse.ok) {
          throw new Error(await readError(conversationsResponse, 'Could not load conversations'));
        }

        const contextData = (await contextResponse.json()) as SessionContext;
        const projectsData = (await projectsResponse.json()) as { projects: Project[] };
        const conversationsData = (await conversationsResponse.json()) as { conversations: ConversationFromApi[] };
        const normalizedConversations = conversationsData.conversations.map(normalizeConversation);

        if (cancelled) return;

        setContext(contextData);
        setProjects(projectsData.projects);
        setConversations(normalizedConversations);
        setSelectedConversationId((current) => {
          const exists = current ? normalizedConversations.some((c) => c.id === current) : false;
          if (exists) return current;
          return pickDefaultConversationId(normalizedConversations);
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while loading workspace');
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setMessages, user]);

  useEffect(() => {
    if (!user || !selectedConversationId) {
      setActiveConversation(null);
      setInitialMessages([]);
      setMessages([]);
      return;
    }

    setActiveConversation(conversations.find((item) => item.id === selectedConversationId) ?? null);
  }, [conversations, selectedConversationId, setMessages, user]);

  useEffect(() => {
    if (activeConversation?.status === 'closed') {
      setIsArchivedSectionExpanded(true);
    }
  }, [activeConversation?.status]);

  useEffect(() => {
    setCollapsedProjectIds((current) => {
      const next = new Set(projects.filter((project) => current.has(project.id)).map((project) => project.id));
      if (next.size === current.size) return current;
      return next;
    });
  }, [projects]);

  useEffect(() => {
    if (!user || !selectedConversationId) {
      setInitialMessages([]);
      setMessages([]);
      return;
    }

    const conversationId = selectedConversationId;
    let cancelled = false;

    async function loadThread() {
      setIsThreadLoading(true);
      setErrorMessage(null);

      try {
        const messagesResponse = await fetch(
          `/api/protected/conversations/${encodeURIComponent(conversationId)}/messages`,
          { cache: 'no-store' },
        );
        if (!messagesResponse.ok) {
          throw new Error(await readError(messagesResponse, 'Could not load messages'));
        }

        const messagesPayload = (await messagesResponse.json()) as { messages: MessageFromApi[] };
        const uiMessages = toUiMessages(messagesPayload.messages);

        if (cancelled) return;

        setInitialMessages(uiMessages);
        setMessages(uiMessages);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while loading thread');
        }
      } finally {
        if (!cancelled) setIsThreadLoading(false);
      }
    }

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, setMessages, user]);

  const handleCreateConversation = useCallback(async (projectId: string | null = null) => {
    if (!canWrite) {
      setErrorMessage('Your role does not allow creating conversations.');
      return;
    }

    setIsCreatingConversation(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/protected/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Chat',
          projectId,
        }),
      });

      if (!response.ok) throw new Error(await readError(response, 'Could not create conversation'));

      const payload = (await response.json()) as { conversation: ConversationFromApi };
      const createdConversation = normalizeConversation(payload.conversation);
      setConversations((current) => [createdConversation, ...current]);
      setSelectedConversationId(createdConversation.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while creating conversation');
    } finally {
      setIsCreatingConversation(false);
    }
  }, [canWrite]);

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (isEditableKeyboardTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;

      if (hasModifier && key === 'k') {
        event.preventDefault();
        if (hasBlockingModalOpen || isShortcutsHelpOpen) return;
        setCommandPaletteQuery('');
        setIsCommandPaletteOpen(true);
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey && key === 'n') {
        event.preventDefault();
        if (hasBlockingModalOpen || isShortcutsHelpOpen || isCreatingConversation || !canWrite) return;
        void handleCreateConversation();
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey && key === 'p') {
        event.preventDefault();
        if (hasBlockingModalOpen || isShortcutsHelpOpen || isCreatingProject || !canWrite) return;
        setCreateProjectName('');
        setCreateProjectVisibility('shared');
        setCreateProjectErrorMessage(null);
        setIsCreateProjectDialogOpen(true);
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey && key === 't') {
        event.preventDefault();
        if (hasBlockingModalOpen || isShortcutsHelpOpen) return;
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && isQuestionMarkKeyEvent(event)) {
        event.preventDefault();
        if (hasBlockingModalOpen || isShortcutsHelpOpen) return;
        setIsShortcutsHelpOpen(true);
      }
    };

    window.addEventListener('keydown', onGlobalShortcut);
    return () => {
      window.removeEventListener('keydown', onGlobalShortcut);
    };
  }, [
    canWrite,
    handleCreateConversation,
    hasBlockingModalOpen,
    isCreatingConversation,
    isCreatingProject,
    isShortcutsHelpOpen,
  ]);

  function toggleProjectCollapsed(projectId: string) {
    setCollapsedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  function openCreateProjectDialog() {
    if (!canWrite) {
      setErrorMessage('Your role does not allow creating projects.');
      return;
    }

    setCreateProjectName('');
    setCreateProjectVisibility('shared');
    setCreateProjectErrorMessage(null);
    setIsCreateProjectDialogOpen(true);
  }

  function closeCreateProjectDialog(options?: { force?: boolean }) {
    if (isCreatingProject && !options?.force) return;
    setIsCreateProjectDialogOpen(false);
    setCreateProjectName('');
    setCreateProjectVisibility('shared');
    setCreateProjectErrorMessage(null);
  }

  async function handleCreateProjectSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite) {
      setErrorMessage('Your role does not allow creating projects.');
      return;
    }

    const name = createProjectName.trim();
    if (!name) {
      setCreateProjectErrorMessage('Name is required.');
      return;
    }

    setIsCreatingProject(true);
    setCreateProjectErrorMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/protected/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          visibility: createProjectVisibility,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not create project'));
      }

      const payload = (await response.json()) as { project: Project };
      setProjects((current) => [payload.project, ...current]);
      closeCreateProjectDialog({ force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error while creating project';
      setCreateProjectErrorMessage(message);
      setErrorMessage(message);
    } finally {
      setIsCreatingProject(false);
    }
  }

  function openRenameModal(conversation: Conversation) {
    if (!canWrite) {
      setErrorMessage('Your role does not allow renaming conversations.');
      return;
    }
    if (renamingConversationId) return;

    setRenameModalConversationId(conversation.id);
    setRenameDraftTitle(conversation.title);
    setRenameErrorMessage(null);
    setErrorMessage(null);
  }

  function closeRenameModal() {
    if (renamingConversationId) return;
    setRenameModalConversationId(null);
    setRenameDraftTitle('');
    setRenameErrorMessage(null);
  }

  function handleRenameInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeRenameModal();
  }

  function openCommandPalette() {
    setCommandPaletteQuery('');
    setIsCommandPaletteOpen(true);
  }

  function closeCommandPalette() {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
  }

  function runCommandPaletteAction(action: CommandPaletteAction) {
    if (action.disabled) return;
    closeCommandPalette();
    action.onSelect();
  }

  async function handleRenameConversationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite) {
      setErrorMessage('Your role does not allow renaming conversations.');
      return;
    }

    if (!renameModalConversationId) return;

    const currentConversation = conversations.find((item) => item.id === renameModalConversationId);
    if (!currentConversation) {
      closeRenameModal();
      return;
    }

    const title = renameDraftTitle.trim();
    if (!title) {
      setRenameErrorMessage('Title is required.');
      return;
    }

    if (title === currentConversation.title) {
      closeRenameModal();
      return;
    }

    setRenamingConversationId(currentConversation.id);
    setRenameErrorMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/conversations/${encodeURIComponent(currentConversation.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) throw new Error(await readError(response, 'Could not rename conversation'));

      const payload = (await response.json()) as { conversation: ConversationFromApi };
      const renamedConversation = normalizeConversation(payload.conversation);
      setConversations((current) =>
        current.map((item) => (item.id === renamedConversation.id ? renamedConversation : item)),
      );
      setActiveConversation((current) =>
        current && current.id === renamedConversation.id ? renamedConversation : current,
      );

      setRenameModalConversationId(null);
      setRenameDraftTitle('');
      setRenameErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error while renaming conversation';
      setRenameErrorMessage(message);
      setErrorMessage(message);
    } finally {
      setRenamingConversationId(null);
    }
  }

  async function handleForkConversationFromMessage(messageId: string) {
    if (!canWrite) {
      setErrorMessage('Your role does not allow forking conversations.');
      return;
    }

    if (!selectedConversationId) {
      setErrorMessage('Select a conversation before forking.');
      return;
    }

    setForkingMessageId(messageId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/conversations/${encodeURIComponent(selectedConversationId)}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not fork conversation'));
      }

      const payload = (await response.json()) as { conversation: ConversationFromApi };
      const forkedConversation = normalizeConversation(payload.conversation);

      setConversations((current) => [forkedConversation, ...current]);
      setSelectedConversationId(forkedConversation.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while forking conversation');
    } finally {
      setForkingMessageId(null);
    }
  }

  async function handlePinConversation(conversation: Conversation, pinned: boolean) {
    if (!canWrite) {
      setErrorMessage('Your role does not allow pinning conversations.');
      return;
    }

    const isCurrentlyPinned = conversation.pinnedAt !== null;
    if (isCurrentlyPinned === pinned) {
      return;
    }

    setPinningConversationId(conversation.id);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/conversations/${encodeURIComponent(conversation.id)}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, `Could not ${pinned ? 'pin' : 'unpin'} conversation`));
      }

      const payload = (await response.json()) as { conversation: ConversationFromApi };
      const updatedConversation = normalizeConversation(payload.conversation);
      setConversations((current) =>
        current.map((item) => (item.id === updatedConversation.id ? updatedConversation : item)),
      );
      setActiveConversation((current) =>
        current && current.id === updatedConversation.id ? updatedConversation : current,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while pinning conversation');
    } finally {
      setPinningConversationId(null);
    }
  }

  async function handleSetConversationArchived(conversation: Conversation, archived: boolean) {
    if (!canWrite) {
      setErrorMessage(`Your role does not allow ${archived ? 'archiving' : 'unarchiving'} conversations.`);
      return;
    }

    const isArchived = conversation.status === 'closed';
    if (isArchived === archived) {
      return;
    }

    setArchivingConversationId(conversation.id);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/conversations/${encodeURIComponent(conversation.id)}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, `Could not ${archived ? 'archive' : 'unarchive'} conversation`));
      }

      const payload = (await response.json()) as { conversation: ConversationFromApi };
      const updatedConversation = normalizeConversation(payload.conversation);
      setConversations((current) => {
        const next = current.map((item) => (item.id === updatedConversation.id ? updatedConversation : item));
        setSelectedConversationId((selectedId) => {
          if (selectedId !== updatedConversation.id) return selectedId;
          if (!archived) return selectedId;

          const nextOpenConversation = next.find((item) => item.status === 'open' && item.id !== updatedConversation.id);
          return nextOpenConversation?.id ?? selectedId;
        });
        return next;
      });
      setActiveConversation((current) =>
        current && current.id === updatedConversation.id ? updatedConversation : current,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while updating archived state');
    } finally {
      setArchivingConversationId(null);
    }
  }

  function handleAttachmentSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    addPendingAttachments(files);
    event.target.value = '';
  }

  function addPendingAttachments(incomingFiles: readonly File[]) {
    if (incomingFiles.length === 0) {
      return;
    }

    const { accepted: supportAccepted, rejected: supportRejected } = splitAttachmentsBySupport(
      incomingFiles,
      selectedModelAttachmentSupport,
    );
    if (supportAccepted.length === 0) {
      setErrorMessage(getUnsupportedAttachmentMessage(selectedModelAttachmentSupport));
      return;
    }

    const { accepted, errors } = validateAttachmentsForMessage({
      existingFiles: pendingAttachments,
      incomingFiles: supportAccepted,
    });

    if (accepted.length > 0) {
      setPendingAttachments((current) => [...current, ...accepted]);
    }

    if (supportRejected.length > 0) {
      setErrorMessage(getUnsupportedAttachmentMessage(selectedModelAttachmentSupport));
    } else if (errors.length > 0) {
      setErrorMessage(errors[0]);
    } else if (accepted.length > 0) {
      setErrorMessage(null);
    }
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = extractFilesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }

    addPendingAttachments(files);
  }

  function handleRemovePendingAttachment(fileId: string) {
    setPendingAttachments((current) => current.filter((file) => pendingAttachmentId(file) !== fileId));
    setErrorMessage(null);
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'streaming' || status === 'submitted' || isPreparingAttachments) return;

    const content = draftMessage.trim();
    if ((!content && pendingAttachments.length === 0) || !selectedConversationId) return;
    if (!canWrite) {
      setErrorMessage('Your role does not allow sending messages.');
      return;
    }
    if (selectedConversationIsArchived) {
      setErrorMessage('This thread is archived. Unarchive it to send messages.');
      return;
    }

    const { accepted: compatibleAttachments, rejected: incompatibleAttachments } = splitAttachmentsBySupport(
      pendingAttachments,
      selectedModelAttachmentSupport,
    );
    if (incompatibleAttachments.length > 0) {
      setPendingAttachments(compatibleAttachments);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      setErrorMessage(getUnsupportedAttachmentMessage(selectedModelAttachmentSupport));
      return;
    }

    setErrorMessage(null);
    setIsPreparingAttachments(true);

    try {
      const fileParts = compatibleAttachments.length > 0 ? await filesToUIParts(compatibleAttachments) : [];

      if (content && fileParts.length > 0) {
        await sendMessage({
          text: content,
          files: fileParts,
        });
      } else if (content) {
        await sendMessage({
          text: content,
        });
      } else {
        await sendMessage({
          files: fileParts,
        });
      }

      setDraftMessage('');
      setPendingAttachments([]);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }

      window.requestAnimationFrame(() => {
        if (selectedConversationIdRef.current !== selectedConversationId) return;
        composerInputRef.current?.focus({ preventScroll: true });
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not attach files');
    } finally {
      setIsPreparingAttachments(false);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (status === 'streaming' || status === 'submitted' || isPreparingAttachments) return;
    event.currentTarget.form?.requestSubmit();
  }

  const isStreaming = status === 'streaming' || status === 'submitted';
  const isAssistantBusy = isStreaming || isPreparingAttachments;
  const hasDraftInput = draftMessage.trim().length > 0 || pendingAttachments.length > 0;
  const showTypingIndicator = isStreaming && !hasVisibleAssistantContent(messages.at(-1));
  const toolCallingHint = selectedModelSupportsTools ? 'Tools enabled' : 'Tools unavailable for this model';
  const commandPaletteActions: CommandPaletteAction[] = [
    {
      id: 'new-chat',
      label: 'New chat',
      description: 'Create and switch to a new conversation.',
      shortcut: newChatShortcutLabel,
      disabled: isCreatingConversation || !canWrite,
      onSelect: () => {
        void handleCreateConversation();
      },
    },
    {
      id: 'new-project',
      label: 'New project',
      description: 'Open the project creation dialog.',
      shortcut: newProjectShortcutLabel,
      disabled: isCreatingProject || !canWrite,
      onSelect: () => {
        openCreateProjectDialog();
      },
    },
    {
      id: 'focus-composer',
      label: 'Focus composer',
      description: 'Jump to the message input.',
      shortcut: null,
      disabled: !canWriteToSelectedConversation || isPreparingAttachments,
      onSelect: () => {
        composerInputRef.current?.focus({ preventScroll: true });
      },
    },
    {
      id: 'open-preferences',
      label: 'Open preferences',
      description: 'Open account and workspace settings.',
      shortcut: null,
      onSelect: () => {
        setIsPreferencesOpen(true);
      },
    },
    {
      id: 'toggle-theme',
      label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      description: 'Toggle the interface theme.',
      shortcut: toggleThemeShortcutLabel,
      onSelect: () => {
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
      },
    },
    {
      id: 'show-shortcuts',
      label: 'Keyboard shortcuts',
      description: 'Open the shortcut reference.',
      shortcut: '?',
      onSelect: () => {
        setIsShortcutsHelpOpen(true);
      },
    },
  ];
  const normalizedCommandPaletteQuery = commandPaletteQuery.trim().toLowerCase();
  const filteredCommandPaletteActions =
    normalizedCommandPaletteQuery.length === 0
      ? commandPaletteActions
      : commandPaletteActions.filter((action) => {
          const searchable = `${action.label} ${action.description} ${action.shortcut ?? ''}`.toLowerCase();
          return searchable.includes(normalizedCommandPaletteQuery);
        });
  const keyboardShortcutItems = [
    { keys: [keyboardModifierLabel, 'K'], description: 'Open command palette' },
    { keys: ['Shift', 'N'], description: 'Create new chat' },
    { keys: ['Shift', 'P'], description: 'Create new project' },
    { keys: ['Shift', 'T'], description: 'Toggle light/dark theme' },
    { keys: ['?'], description: 'Open keyboard shortcuts' },
  ];

  function renderConversationRow(conversation: Conversation) {
    const isArchived = conversation.status === 'closed';
    const isBusy =
      isCreatingConversation
      || isCreatingProject
      || renamingConversationId !== null
      || pinningConversationId !== null
      || archivingConversationId !== null;
    const isPinning = pinningConversationId === conversation.id;
    const isArchiving = archivingConversationId === conversation.id;
    const isPinned = conversation.pinnedAt !== null;
    const rowNumber = conversationOrderMap.get(conversation.id) ?? 0;

    return (
      <div className={styles.conversationRow} key={conversation.id}>
        <Button
          className={`${styles.conversationItem} ${canWrite ? styles.conversationItemWithActions : ''} ${selectedConversationId === conversation.id ? styles.conversationItemActive : ''}`}
          onClick={() => setSelectedConversationId(conversation.id)}
          type="button"
          variant="ghost"
        >
          <span className={styles.convNum}>{String(rowNumber).padStart(2, '0')}</span>
          <span className={styles.convBody}>
            <span
              className={styles.conversationTitleLine}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openRenameModal(conversation);
              }}
              title={canWrite ? 'Double-click to rename' : conversation.title}
            >
              <span className={styles.conversationTitle}>{conversation.title}</span>
              {isPinned && !isArchived ? (
                <span
                  aria-label="Pinned thread"
                  className={styles.conversationPinMarker}
                  title="Pinned thread"
                >
                  <Pin size={11} />
                </span>
              ) : null}
              {isArchived ? (
                <span
                  aria-label="Archived thread"
                  className={styles.conversationArchivedMarker}
                  title="Archived thread"
                >
                  <Archive size={11} />
                </span>
              ) : null}
              {!isArchived ? <span aria-hidden="true" className={styles.conversationOpenDot} /> : null}
            </span>
            <span className={styles.conversationMeta}>{formatConversationTime(conversation.createdAt)}</span>
          </span>
        </Button>

        {canWrite ? (
          <div className={styles.conversationHoverActions}>
            <Button
              aria-label="Rename chat"
              className={styles.conversationIconButton}
              disabled={isBusy}
              onClick={(event) => {
                event.stopPropagation();
                openRenameModal(conversation);
              }}
              size="icon-xs"
              title="Rename chat"
              type="button"
              variant="ghost"
            >
              <Pencil size={12} />
            </Button>
            {!isArchived ? (
              <Button
                aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                className={styles.conversationIconButton}
                disabled={isBusy}
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePinConversation(conversation, !isPinned);
                }}
                size="icon-xs"
                title={isPinned ? 'Unpin chat' : 'Pin chat'}
                type="button"
                variant="ghost"
              >
                {isPinning ? <Loader2 className={styles.spinningIcon} size={12} /> : isPinned ? <PinOff size={12} /> : <Pin size={12} />}
              </Button>
            ) : null}
            <Button
              aria-label={isArchived ? 'Unarchive chat' : 'Archive chat'}
              className={styles.conversationIconButton}
              disabled={isBusy}
              onClick={(event) => {
                event.stopPropagation();
                void handleSetConversationArchived(conversation, !isArchived);
              }}
              size="icon-xs"
              title={isArchived ? 'Unarchive chat' : 'Archive chat'}
              type="button"
              variant="ghost"
            >
              {isArchiving ? (
                <Loader2 className={styles.spinningIcon} size={12} />
              ) : isArchived ? (
                <ArchiveRestore size={12} />
              ) : (
                <Archive size={12} />
              )}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  /* ─── Unauthenticated ─── */
  if (!loading && !user) {
    return <LandingSeven />;
  }

  /* ─── Authenticated ─── */
  return (
    <main className={`${styles.shell} ${shadcnThemeClass}`} data-theme={theme}>
      <section className={styles.layout} data-sidebar-collapsed={isSidebarCollapsed ? 'true' : 'false'}>
        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <div className={styles.brandHeader}>
              {!isSidebarCollapsed ? (
                <div className={styles.brandIdentity}>
                  <span className={styles.brandDecor} />
                  <span className={styles.brandSystem}>Control</span>
                  <span className={styles.brandName}>Plane</span>
                </div>
              ) : null}
              <Button
                aria-label={isSidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
                className={styles.sidebarToggle}
                onClick={() => setIsSidebarCollapsed((current) => !current)}
                size="icon"
                title={isSidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
                type="button"
                variant="ghost"
              >
                {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </Button>
            </div>
            {!isSidebarCollapsed ? (
              <div className={styles.brandOrg}>
                {context ? (
                  <>
                    <span className={styles.brandOrgName}>{context.orgName}</span>
                    <Badge className={styles.rolePill} variant="outline">
                      {context.role}
                    </Badge>
                  </>
                ) : (
                  <span className={styles.brandOrgName}>Loading workspace…</span>
                )}
              </div>
            ) : null}
          </div>

          {!isSidebarCollapsed ? (
            <>
          <div className={styles.controls}>
            <Button
              className={styles.newChatButton}
              disabled={isCreatingConversation || !canWrite}
              onClick={() => {
                void handleCreateConversation();
              }}
              title={`New chat (${newChatShortcutLabel})`}
              type="button"
            >
              <span className={styles.newButtonContent}>
                <Plus size={14} />
                <span className={styles.newButtonLabel}>{isCreatingConversation ? 'Creating…' : 'New chat'}</span>
                {!isCreatingConversation ? <span className={styles.newButtonShortcut}>{newChatShortcutLabel}</span> : null}
              </span>
            </Button>
            <Button
              className={styles.newProjectButton}
              disabled={isCreatingProject || !canWrite}
              onClick={openCreateProjectDialog}
              title={`New project (${newProjectShortcutLabel})`}
              type="button"
              variant="ghost"
            >
              <span className={styles.newButtonContent}>
                <Plus size={14} />
                <span className={styles.newButtonLabel}>{isCreatingProject ? 'Creating…' : 'New project'}</span>
                {!isCreatingProject ? <span className={styles.newButtonShortcut}>{newProjectShortcutLabel}</span> : null}
              </span>
            </Button>
          </div>

          <div className={styles.conversationList}>
            {isBootstrapping ? <p className={styles.listEmpty}>Loading threads…</p> : null}
            {!isBootstrapping && conversations.length === 0 ? (
              <p className={styles.listEmpty}>No threads yet.</p>
            ) : null}
            {!isBootstrapping ? (
              <>
                <div className={styles.projectSection}>
                  <div className={styles.projectHeader}>
                    <span className={styles.projectTitle}>Outside projects</span>
                  </div>
                  {groupedConversations.unfiled.length === 0 ? (
                    <p className={styles.projectEmpty}>No chats outside projects.</p>
                  ) : (
                    groupedConversations.unfiled.map((conversation) => renderConversationRow(conversation))
                  )}
                </div>

                {projects.map((project) => {
                  const projectConversations = groupedConversations.byProject.get(project.id) ?? [];
                  const isProjectCollapsed = collapsedProjectIds.has(project.id);

                  return (
                    <div className={styles.projectSection} key={project.id}>
                      <div className={styles.projectHeader}>
                        <button
                          aria-expanded={!isProjectCollapsed}
                          className={styles.projectSectionToggle}
                          onClick={() => toggleProjectCollapsed(project.id)}
                          type="button"
                        >
                          <div className={styles.projectTitleWrap}>
                            <span className={styles.projectTitle} title={project.name}>
                              {project.name}
                            </span>
                            <span className={styles.projectVisibilityTag} data-visibility={project.visibility}>
                              {project.visibility}
                            </span>
                          </div>
                          <span className={styles.projectHeaderMeta}>
                            <span className={styles.projectHeaderCount}>{projectConversations.length}</span>
                            {isProjectCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </span>
                        </button>
                        {canWrite ? (
                          <Button
                            className={styles.projectAddChatButton}
                            disabled={isCreatingConversation}
                            onClick={() => {
                              void handleCreateConversation(project.id);
                            }}
                            size="icon-xs"
                            title={`Create chat in ${project.name}`}
                            type="button"
                            variant="ghost"
                          >
                            <Plus size={12} />
                          </Button>
                        ) : null}
                      </div>

                      {isProjectCollapsed
                        ? null
                        : projectConversations.length === 0
                          ? <p className={styles.projectEmpty}>No chats in this project.</p>
                          : projectConversations.map((conversation) => renderConversationRow(conversation))}
                    </div>
                  );
                })}

                {archivedConversations.length > 0 ? (
                  <div className={styles.projectSection}>
                    <button
                      aria-expanded={isArchivedSectionExpanded}
                      className={styles.archivedSectionToggle}
                      onClick={() => setIsArchivedSectionExpanded((current) => !current)}
                      type="button"
                    >
                      <span className={styles.projectTitle}>Archived threads</span>
                      <span className={styles.archivedSectionMeta}>
                        <span className={styles.archivedSectionCount}>{archivedConversations.length}</span>
                        {isArchivedSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    </button>
                    {isArchivedSectionExpanded ? (
                      archivedConversations.map((conversation) => renderConversationRow(conversation))
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className={styles.userCard}>
            <div className={styles.userIdentity}>
              <Avatar className={styles.userAvatar}>
                <AvatarFallback className={styles.userAvatarFallback}>
                  {getInitial(context?.actorEmail ?? null, context?.actorUserId ?? '?')}
                </AvatarFallback>
              </Avatar>
              <div className={styles.userMeta}>
                <p className={styles.userMetaStrong}>{context?.actorEmail ?? context?.actorUserId ?? 'Loading…'}</p>
                <p className={styles.userMetaSoft}>{context?.orgId ?? '—'}</p>
              </div>
            </div>
            <div className={styles.userOptions} role="group" aria-label="User and WorkOS options">
              {context?.role === 'admin' ? (
                <Button
                  className={styles.ghostButton}
                  onClick={() => {
                    window.location.href = '/admin';
                  }}
                  type="button"
                  variant="ghost"
                >
                  Admin dashboard
                </Button>
              ) : null}
              <Button
                className={styles.ghostButton}
                onClick={() => setIsPreferencesOpen(true)}
                type="button"
                variant="ghost"
              >
                Preferences
              </Button>
              <Button
                className={styles.ghostButton}
                onClick={() => {
                  void signOut();
                }}
                type="button"
                variant="ghost"
              >
                Sign out
              </Button>
            </div>
          </div>
            </>
          ) : null}
        </aside>

        {/* ── Main ── */}
        <div className={styles.main}>
          <header className={styles.mainHeader}>
            <div className={styles.headerLeft}>
              <h2 className={styles.headerTitle}>{activeConversation?.title ?? 'Select a thread'}</h2>
              <p className={styles.headerMeta}>
                {selectedConversationId ? `id:${selectedConversationId.slice(0, 16)}…` : 'No thread selected'}
              </p>
            </div>
            <div className={styles.headerRight}>
              {activeConversation && (
                <span
                  className={styles.statusDot}
                  data-open={String(activeConversation.status === 'open')}
                  title={activeConversation.status === 'open' ? 'active' : 'archived'}
                />
              )}
              <Badge className={styles.badge} variant="outline">
                {context?.role ?? '—'}
              </Badge>
              <Button
                className={styles.artifactToggle}
                onClick={openCommandPalette}
                size="sm"
                title={`Open commands (${commandPaletteShortcutLabel})`}
                type="button"
                variant="ghost"
              >
                Commands
              </Button>
              <Button
                className={styles.artifactToggle}
                onClick={() => {
                  if (artifactPanel.isOpen) {
                    artifactPanel.closePanel();
                    return;
                  }
                  artifactPanel.openPanel();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Artifacts
              </Button>
              <Button
                className={styles.themeToggle}
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                size="icon"
                title={`${theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} (${toggleThemeShortcutLabel})`}
                type="button"
                variant="ghost"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
            </div>
          </header>

          <section
            className={styles.thread}
            onScroll={handleThreadScroll}
            ref={threadRef}
            style={{
              marginRight: artifactPanel.isOpen ? 'min(420px, 92vw)' : 0,
            }}
          >
            {selectedConversationId === null ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyStateIcon} />
                <p className={styles.emptyStateText}>Select a thread from the sidebar or create a new one to begin.</p>
              </div>
            ) : null}

            {selectedConversationId !== null && isThreadLoading ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateText}>Loading thread…</p>
              </div>
            ) : null}

            {selectedConversationId !== null && !isThreadLoading && messages.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyStateIcon} />
                <p className={styles.emptyStateText}>No messages yet. Send the first one below.</p>
              </div>
            ) : null}

            {messages.map((message) => {
              if (message.role === 'assistant' && !hasVisibleAssistantContent(message)) {
                return null;
              }

              const isAssistantMessage = message.role === 'assistant';
              const senderLabel = message.role === 'user' ? actorMessageLabel : message.role;
              const assistantCopyText = isAssistantMessage && Array.isArray(message.parts) ? getTextFromParts(message.parts) : '';
              const reasoningText = isAssistantMessage && Array.isArray(message.parts)
                ? getReasoningFromParts(message.parts)
                : '';
              const hasStreamingReasoningPart = isAssistantMessage
                && Array.isArray(message.parts)
                && message.parts.some((part) => {
                  if (!part || typeof part !== 'object') {
                    return false;
                  }

                  const typedPart = part as Record<string, unknown>;
                  return typedPart.type === 'reasoning' && typedPart.state === 'streaming';
                });
              const hasReasoningText = reasoningText.length > 0;
              const showReasoningSection = hasReasoningText || hasStreamingReasoningPart;
              const isStreamingAssistantMessage = isAssistantMessage && isStreaming && message.id === messages.at(-1)?.id;
              const isReasoningExpanded =
                hasReasoningText &&
                (expandedReasoningByMessageId[message.id] ?? false);
              const canForkFromMessage = canWrite && selectedConversationId !== null && !isAssistantBusy;
              const isForkingAtMessage = forkingMessageId === message.id;
              const isForkDisabled = !canForkFromMessage || isForkingAtMessage;

              return (
                <article
                  className={`${styles.bubble} ${message.role === 'user' ? styles.bubbleUser : styles.bubbleBot}`}
                  key={message.id}
                >
                  <div className={styles.bubbleMeta}>
                    <span className={styles.bubbleMetaRole}>
                      <span className={styles.bubbleMetaDot} />
                      {senderLabel}
                    </span>
                    <span className={styles.bubbleMetaActions}>
                      <button
                        aria-label="Fork from this message"
                        className={`${styles.messageBubbleAction} ${styles.messageForkButton}`}
                        disabled={isForkDisabled}
                        onClick={() => {
                          void handleForkConversationFromMessage(message.id);
                        }}
                        title="Fork conversation from this message"
                        type="button"
                      >
                        {isForkingAtMessage ? <Loader2 className={styles.spinningIcon} size={12} /> : <GitFork size={12} />}
                      </button>
                      {message.role === 'assistant' && assistantCopyText.length > 0 ? (
                        <CopyToClipboardButton
                          className={`${styles.messageBubbleAction} ${styles.messageCopyButtonTop} assistant-copy-button`}
                          copiedLabel="Copied"
                          errorLabel="Copy failed"
                          idleLabel="Copy"
                          idleTitle="Copy response from the assistant"
                          text={assistantCopyText}
                        />
                      ) : null}
                    </span>
                  </div>
                  {isAssistantMessage && showReasoningSection ? (
                    <section className={styles.reasoningSection}>
                      <button
                        aria-expanded={isReasoningExpanded}
                        className={styles.reasoningToggle}
                        data-expanded={String(isReasoningExpanded)}
                        disabled={!hasReasoningText}
                        onClick={() =>
                          setExpandedReasoningByMessageId((previous) => ({
                            ...previous,
                            [message.id]: !isReasoningExpanded,
                          }))
                        }
                        type="button"
                      >
                        <span>{isStreamingAssistantMessage ? 'Reasoning · live' : 'Reasoning'}</span>
                        <span className={styles.reasoningToggleState}>
                          {!hasReasoningText ? 'Thinking…' : isReasoningExpanded ? 'Hide' : 'Show'}
                        </span>
                      </button>
                      {isReasoningExpanded ? <pre className={styles.reasoningContent}>{reasoningText}</pre> : null}
                    </section>
                  ) : null}
                  <div className={styles.bubbleContent}>
                    {message.parts.map((part, index) => {
                      if (!part || typeof part !== 'object') {
                        return null;
                      }

                      const typedPart = part as Record<string, unknown>;
                      if (typedPart.type === 'text') {
                        const text = typeof typedPart.text === 'string' ? typedPart.text : '';
                        if (message.role === 'assistant') {
                          return (
                            <MarkdownContent
                              className={styles.assistantMarkdown}
                              content={text}
                              enableCodeBlockCopy
                              key={`${message.id}-text-${index}`}
                            />
                          );
                        }

                        return (
                          <p
                            key={`${message.id}-text-${index}`}
                            style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                          >
                            {text}
                          </p>
                        );
                      }

                      const filePart = getFilePart(part);
                      if (filePart) {
                        const filename = formatAttachmentTitle(index, filePart.filename);
                        const isImage = isImageMediaType(filePart.mediaType);

                        if (isImage) {
                          return (
                            <figure className={styles.fileAttachment} key={`${message.id}-file-${index}`}>
                              <a href={filePart.url} rel="noreferrer" target="_blank">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt={filename}
                                  className={styles.fileAttachmentImage}
                                  loading="lazy"
                                  src={filePart.url}
                                />
                              </a>
                              <figcaption className={styles.fileAttachmentCaption}>
                                <a download={filename} href={filePart.url} rel="noreferrer" target="_blank">
                                  {filename}
                                </a>
                              </figcaption>
                            </figure>
                          );
                        }

                        return (
                          <a
                            className={styles.fileAttachmentCard}
                            download={filename}
                            href={filePart.url}
                            key={`${message.id}-file-${index}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <span className={styles.fileAttachmentName}>{filename}</span>
                            <span className={styles.fileAttachmentType}>{filePart.mediaType}</span>
                          </a>
                        );
                      }

                      if (typedPart.type === 'reasoning') {
                        return null;
                      }

                      if (isToolPart(part)) {
                        return (
                          <div key={`${message.id}-tool-${index}`} style={{ marginTop: 8 }}>
                            <ToolPartCard onRespondToApproval={addToolApprovalResponse} part={part} />
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                  <div className={styles.bubbleFooterActions}>
                    <button
                      aria-label="Fork from this message"
                      className={`${styles.messageBubbleAction} ${styles.messageForkButton}`}
                      disabled={isForkDisabled}
                      onClick={() => {
                        void handleForkConversationFromMessage(message.id);
                      }}
                      title="Fork conversation from this message"
                      type="button"
                    >
                      {isForkingAtMessage ? <Loader2 className={styles.spinningIcon} size={12} /> : <GitFork size={12} />}
                    </button>
                    {message.role === 'assistant' && assistantCopyText.length > 0 ? (
                      <CopyToClipboardButton
                        className={`${styles.messageBubbleAction} ${styles.messageCopyButtonBottom} assistant-copy-button`}
                        copiedLabel="Copied"
                        errorLabel="Copy failed"
                        idleLabel="Copy"
                        idleTitle="Copy response from the assistant"
                        text={assistantCopyText}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}

            {showTypingIndicator && (
              <article className={`${styles.bubble} ${styles.bubbleBot} ${styles.typingBubble}`} aria-label="Assistant typing">
                <div className={styles.bubbleMeta}>
                  <span className={styles.bubbleMetaRole}>
                    <span className={styles.bubbleMetaDot} />
                    assistant
                  </span>
                </div>
                <div className={styles.bubbleContent}>
                  <span className={styles.typingIndicator} aria-hidden="true">
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                  </span>
                </div>
              </article>
            )}
          </section>
          <div
            className={styles.composerWrap}
            style={{
              marginRight: artifactPanel.isOpen ? 'min(420px, 92vw)' : 0,
            }}
          >
            {showScrollToBottomButton ? (
              <button
                aria-label="Jump to latest message"
                className={styles.scrollToBottomButton}
                onClick={handleScrollToBottom}
                title="Jump to latest message"
                type="button"
              >
                <ArrowDown aria-hidden size={16} />
              </button>
            ) : null}
            <form className={styles.composer} onSubmit={handleSendMessage}>
              <input
                accept={attachmentInputAccept}
                className={styles.hiddenAttachmentInput}
                disabled={!selectedModelSupportsAttachments || !canWriteToSelectedConversation || isAssistantBusy}
                multiple
                onChange={handleAttachmentSelection}
                ref={attachmentInputRef}
                type="file"
              />

              {pendingAttachments.length > 0 ? (
                <div className={styles.pendingAttachments}>
                  {pendingAttachments.map((file) => {
                    const fileId = pendingAttachmentId(file);
                    return (
                      <div className={styles.pendingAttachment} key={fileId}>
                        <span className={styles.pendingAttachmentName} title={file.name}>
                          {file.name}
                        </span>
                        <span className={styles.pendingAttachmentSize}>{formatFileSize(file.size)}</span>
                        <button
                          aria-label={`Remove ${file.name}`}
                          className={styles.pendingAttachmentRemove}
                          onClick={() => handleRemovePendingAttachment(fileId)}
                          type="button"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <Textarea
                aria-busy={isAssistantBusy}
                className={styles.composerInput}
                disabled={!canWriteToSelectedConversation || isPreparingAttachments}
                onChange={(e) => setDraftMessage(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                onPaste={handleComposerPaste}
                placeholder={
                  !canWrite
                    ? 'Viewer role — read only'
                      : !selectedConversationId
                        ? 'Select a thread first…'
                      : selectedConversationIsArchived
                        ? 'This thread is archived. Unarchive it to continue chatting.'
                      : selectedModelAttachmentSupport === 'files'
                        ? 'Send a message or attach files…'
                        : selectedModelAttachmentSupport === 'images-only'
                          ? 'Send a message or attach images…'
                        : 'Send a message…'
                }
                readOnly={isAssistantBusy}
                ref={composerInputRef}
                rows={1}
                value={draftMessage}
              />
              <Button
                aria-label="Send message"
                className={styles.sendButton}
                disabled={!canWriteToSelectedConversation || isAssistantBusy || !hasDraftInput}
                title="Send message"
                type="submit"
              >
                {isAssistantBusy ? <Loader2 className={styles.spinningIcon} size={16} /> : <ArrowUp size={16} />}
              </Button>
            </form>
            {canWrite && selectedConversationId && !selectedConversationIsArchived && (
              <div className={styles.composerMetaRow}>
                <div className={styles.modelPicker}>
                  <ModelPicker
                    align="start"
                    id="chat-model-picker-main"
                    models={AVAILABLE_MODELS}
                    onSelectModel={setSelectedChatModel}
                    selectedModelId={selectedChatModel}
                    side="top"
                  />
                  <Button
                    aria-label="Attach files"
                    className={styles.attachButton}
                    disabled={isAssistantBusy || !selectedModelSupportsAttachments}
                    onClick={() => {
                      if (!selectedModelSupportsAttachments) {
                        return;
                      }
                      attachmentInputRef.current?.click();
                    }}
                    title={
                      selectedModelAttachmentSupport === 'files'
                        ? `Attach files (${MAX_ATTACHMENTS_PER_MESSAGE} max)`
                        : selectedModelAttachmentSupport === 'images-only'
                          ? 'Attach images'
                          : 'This model does not support file attachments'
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Paperclip size={14} />
                  </Button>
                  {isStreaming && (
                    <Button
                      className={styles.ghostButton}
                      onClick={() => stop()}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Stop
                    </Button>
                  )}
                </div>
                <p className={styles.composerHint}>
                  {selectedModelAttachmentSupport === 'files'
                    ? `Enter to send · Shift+Enter newline · Ctrl/Cmd+V to paste files · Files up to 1.5 MB · ${toolCallingHint}`
                    : selectedModelAttachmentSupport === 'images-only'
                      ? `Enter to send · Shift+Enter newline · Ctrl/Cmd+V to paste images · Images up to 1.5 MB · ${toolCallingHint}`
                      : `Enter to send · Shift+Enter newline · This model does not support files · ${toolCallingHint}`}
                </p>
              </div>
            )}
            {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          </div>
          <div className={styles.artifactOverlay}>
            <ArtifactPanel
              activeArtifact={artifactPanel.activeArtifact}
              activeArtifactId={artifactPanel.activeArtifactId}
              activeContent={artifactPanel.activeContent}
              activeKind={artifactPanel.activeKind}
              activeTitle={artifactPanel.activeTitle}
              artifacts={artifactPanel.artifacts}
              errorMessage={artifactPanel.errorMessage}
              isLoadingArtifact={artifactPanel.isLoadingArtifact}
              isLoadingArtifacts={artifactPanel.isLoadingArtifacts}
              isOpen={artifactPanel.isOpen}
              isStreaming={artifactPanel.isStreaming}
              onClose={artifactPanel.closePanel}
              onRefresh={() => {
                void artifactPanel.refreshArtifacts();
              }}
              onSelectArtifact={artifactPanel.selectArtifact}
              versions={artifactPanel.versions}
            />
          </div>
        </div>
      </section>

      <Dialog
        open={Boolean(renameModalConversationId)}
        onOpenChange={(open) => {
          if (open) return;
          if (renamingConversationId !== null) return;
          closeRenameModal();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn('sm:max-w-[360px]', dialogSurfaceClass)}
          onEscapeKeyDown={(event) => {
            if (renamingConversationId !== null) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (renamingConversationId !== null) {
              event.preventDefault();
            }
          }}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-tight">Rename chat</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleRenameConversationSubmit}>
            <Input
              autoFocus
              className={cn(
                'h-10',
                theme === 'dark'
                  ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500'
                  : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500',
              )}
              disabled={renamingConversationId !== null}
              onChange={(event) => setRenameDraftTitle(event.target.value)}
              onKeyDown={handleRenameInputKeyDown}
              placeholder="Chat title"
              ref={renameInputRef}
              value={renameDraftTitle}
            />
            {renameErrorMessage ? <p className="text-destructive text-xs">{renameErrorMessage}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                className={theme === 'dark' ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-300 hover:bg-zinc-100'}
                disabled={renamingConversationId !== null}
                onClick={closeRenameModal}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className={theme === 'dark' ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200' : ''}
                disabled={renamingConversationId !== null}
                size="sm"
                type="submit"
              >
                {renamingConversationId !== null ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateProjectDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          closeCreateProjectDialog();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn('sm:max-w-[380px]', dialogSurfaceClass)}
          onEscapeKeyDown={(event) => {
            if (isCreatingProject) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isCreatingProject) {
              event.preventDefault();
            }
          }}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-tight">Create project</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleCreateProjectSubmit}>
            <Input
              autoFocus
              className={cn(
                'h-10',
                theme === 'dark'
                  ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500'
                  : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500',
              )}
              disabled={isCreatingProject}
              onChange={(event) => setCreateProjectName(event.target.value)}
              placeholder="Project name"
              value={createProjectName}
            />
            <div className="grid gap-2">
              <p className={cn('text-[11px] font-medium tracking-[0.08em] uppercase', dialogMutedClass)}>Visibility</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className={cn(
                    theme === 'dark' ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-300 hover:bg-zinc-100',
                    createProjectVisibility === 'shared' && (theme === 'dark' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-zinc-100'),
                  )}
                  disabled={isCreatingProject}
                  onClick={() => setCreateProjectVisibility('shared')}
                  size="sm"
                  type="button"
                  variant={createProjectVisibility === 'shared' ? 'default' : 'outline'}
                >
                  Shared
                </Button>
                <Button
                  className={cn(
                    theme === 'dark' ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-300 hover:bg-zinc-100',
                    createProjectVisibility === 'private' && (theme === 'dark' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-zinc-100'),
                  )}
                  disabled={isCreatingProject}
                  onClick={() => setCreateProjectVisibility('private')}
                  size="sm"
                  type="button"
                  variant={createProjectVisibility === 'private' ? 'default' : 'outline'}
                >
                  Private
                </Button>
              </div>
            </div>
            {createProjectErrorMessage ? <p className="text-destructive text-xs">{createProjectErrorMessage}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                className={theme === 'dark' ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-300 hover:bg-zinc-100'}
                disabled={isCreatingProject}
                onClick={() => closeCreateProjectDialog()}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className={theme === 'dark' ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200' : ''}
                disabled={isCreatingProject}
                size="sm"
                type="submit"
              >
                {isCreatingProject ? 'Saving…' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCommandPaletteOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsCommandPaletteOpen(true);
            return;
          }
          closeCommandPalette();
        }}
      >
        <DialogContent
          aria-describedby="command-palette-description"
          className={cn('overflow-hidden p-0 sm:max-w-[560px]', dialogSurfaceClass)}
          showCloseButton={false}
        >
          <header className={cn('border-b px-4 py-3', dialogBorderClass)}>
            <DialogTitle className="text-sm font-semibold tracking-tight">Command palette</DialogTitle>
            <p className={cn('mt-1 text-xs', dialogMutedClass)} id="command-palette-description">
              Run actions quickly. Press Enter to run the first command.
            </p>
          </header>
          <div className="grid gap-3 p-3">
            <Input
              autoFocus
              className={cn(
                theme === 'dark'
                  ? 'h-10 border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500'
                  : 'h-10 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500',
              )}
              onChange={(event) => setCommandPaletteQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                const firstAction = filteredCommandPaletteActions.find((action) => !action.disabled);
                if (!firstAction) return;
                runCommandPaletteAction(firstAction);
              }}
              placeholder="Type a command..."
              value={commandPaletteQuery}
            />
            <div className="grid max-h-[320px] gap-1 overflow-y-auto pr-1">
              {filteredCommandPaletteActions.length === 0 ? (
                <p className={cn('px-2 py-2 text-xs', dialogMutedClass)}>No commands found.</p>
              ) : (
                filteredCommandPaletteActions.map((action) => (
                  <button
                    className={cn(
                      'grid gap-0.5 rounded-md border px-3 py-2 text-left transition',
                      theme === 'dark'
                        ? 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                        : 'border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 hover:bg-white',
                      action.disabled ? 'cursor-not-allowed opacity-50' : '',
                    )}
                    disabled={action.disabled}
                    key={action.id}
                    onClick={() => runCommandPaletteAction(action)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{action.label}</span>
                      {action.shortcut ? (
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]',
                            theme === 'dark'
                              ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
                              : 'border-zinc-300 bg-zinc-100 text-zinc-600',
                          )}
                        >
                          {action.shortcut}
                        </span>
                      ) : null}
                    </div>
                    <span className={cn('text-xs', dialogMutedClass)}>{action.description}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isShortcutsHelpOpen} onOpenChange={setIsShortcutsHelpOpen}>
        <DialogContent
          aria-describedby="keyboard-shortcuts-description"
          className={cn('overflow-hidden p-0 sm:max-w-[480px]', dialogSurfaceClass)}
          showCloseButton={false}
        >
          <header className={cn('flex items-center justify-between gap-3 border-b px-4 py-3', dialogBorderClass)}>
            <DialogTitle className="text-sm font-semibold tracking-tight">Keyboard shortcuts</DialogTitle>
            <Button
              className={theme === 'dark' ? 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100' : ''}
              onClick={() => setIsShortcutsHelpOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Close
            </Button>
          </header>
          <div className="grid gap-2 p-4">
            <p className={cn('text-xs', dialogMutedClass)} id="keyboard-shortcuts-description">
              Shortcuts are ignored while typing in inputs, textareas, or contenteditable fields.
            </p>
            {keyboardShortcutItems.map((item) => (
              <div className={cn('flex items-center justify-between gap-3 rounded-md border px-3 py-2', dialogBorderClass)} key={item.description}>
                <span className="text-sm">{item.description}</span>
                <span className="flex items-center gap-1">
                  {item.keys.map((key, keyIndex) => (
                    <span className="inline-flex items-center gap-1" key={`${item.description}-${key}`}>
                      {keyIndex > 0 ? <span className={cn('text-xs', dialogMutedClass)}>+</span> : null}
                      <kbd
                        className={cn(
                          'rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em]',
                          theme === 'dark'
                            ? 'border-zinc-700 bg-zinc-900 text-zinc-200'
                            : 'border-zinc-300 bg-zinc-100 text-zinc-700',
                        )}
                      >
                        {key}
                      </kbd>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
        <DialogContent
          aria-describedby={undefined}
          className={cn('overflow-hidden p-0 sm:max-w-[560px]', dialogSurfaceClass)}
          showCloseButton={false}
        >
          <header className={cn('flex items-center justify-between gap-3 border-b px-4 py-3', dialogBorderClass)}>
            <DialogTitle className="text-sm font-semibold tracking-tight">Preferences</DialogTitle>
            <Button
              className={theme === 'dark' ? 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100' : ''}
              onClick={() => setIsPreferencesOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Close
            </Button>
          </header>
          <div className="grid gap-4 p-4">
            <div className="grid gap-1">
              <p className={cn('text-[11px] font-medium tracking-[0.08em] uppercase', dialogMutedClass)}>Account</p>
              <p className="text-sm break-words">{context?.actorEmail ?? context?.actorUserId ?? 'Loading…'}</p>
            </div>
            <div className="grid gap-1">
              <p className={cn('text-[11px] font-medium tracking-[0.08em] uppercase', dialogMutedClass)}>Workspace</p>
              <p className="text-sm break-words">
                {context?.orgName ?? 'Loading…'} · {context?.orgId ?? '—'}
              </p>
            </div>
            <div className="grid gap-1">
              <p className={cn('text-[11px] font-medium tracking-[0.08em] uppercase', dialogMutedClass)}>Role</p>
              <p className="text-sm break-words">{context?.role ?? '—'}</p>
            </div>
            <div className="grid gap-2">
              <p className={cn('text-[11px] font-medium tracking-[0.08em] uppercase', dialogMutedClass)}>Theme</p>
              <div className="grid grid-cols-2 gap-2 max-[980px]:grid-cols-1">
                <Button
                  className={cn(
                    theme === 'dark' ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-300 hover:bg-zinc-100',
                    theme === 'dark' && 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
                  )}
                  onClick={() => setTheme('dark')}
                  size="sm"
                  type="button"
                  variant={theme === 'dark' ? 'default' : 'outline'}
                >
                  Dark
                </Button>
                <Button
                  className={cn(
                    theme === 'dark' ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-300 hover:bg-zinc-100',
                    theme === 'light' && 'bg-zinc-900 text-zinc-100 hover:bg-zinc-800',
                  )}
                  onClick={() => setTheme('light')}
                  size="sm"
                  type="button"
                  variant={theme === 'light' ? 'default' : 'outline'}
                >
                  Light
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
