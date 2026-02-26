'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { useEffect, useRef, useState } from 'react';
import { normalizeMessageParts } from '@/lib/chat/message-parts';

export type Role = 'admin' | 'user';

export type SessionContext = {
  actorUserId: string;
  actorEmail: string | null;
  orgId: string;
  orgName: string;
  role: Role;
  conversationCount: number;
};

export type Conversation = {
  id: string;
  title: string;
  status: 'open' | 'closed';
  createdAt: number;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts?: unknown[];
  content?: string;
  attachments?: unknown[];
  redacted: boolean;
  createdAt: number;
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getInitial(email: string | null, userId: string): string {
  return (email?.[0] ?? userId[0] ?? '?').toUpperCase();
}

export function useChatState() {
  const { user, signOut, loading } = useAuth();

  const [context, setContext] = useState<SessionContext | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [draft, setDraft] = useState('');

  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const canWrite = context !== null;

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!user) {
      setContext(null); setConversations([]); setSelectedConversationId(null);
      setActiveConversation(null); setMessages([]); setError(null);
      return;
    }
    let cancelled = false;
    async function bootstrap() {
      setIsBootstrapping(true); setError(null);
      try {
        const [cr, cvr] = await Promise.all([
          fetch('/api/protected/context', { cache: 'no-store' }),
          fetch('/api/protected/conversations', { cache: 'no-store' }),
        ]);
        if (!cr.ok) throw new Error(await readError(cr, 'Could not load context'));
        if (!cvr.ok) throw new Error(await readError(cvr, 'Could not load conversations'));
        const ctx = (await cr.json()) as SessionContext;
        const cvs = (await cvr.json()) as { conversations: Conversation[] };
        if (cancelled) return;
        setContext(ctx);
        setConversations(cvs.conversations);
        setSelectedConversationId((cur) => {
          const exists = cur ? cvs.conversations.some((c) => c.id === cur) : false;
          return exists ? cur : (cvs.conversations[0]?.id ?? null);
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unexpected error');
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedConversationId) { setActiveConversation(null); setMessages([]); return; }
    const id = selectedConversationId;
    let cancelled = false;
    async function loadThread() {
      setIsThreadLoading(true); setError(null);
      try {
        const [cr, mr] = await Promise.all([
          fetch(`/api/protected/conversations/${encodeURIComponent(id)}`, { cache: 'no-store' }),
          fetch(`/api/protected/conversations/${encodeURIComponent(id)}/messages`, { cache: 'no-store' }),
        ]);
        if (!cr.ok) throw new Error(await readError(cr, 'Could not load conversation'));
        if (!mr.ok) throw new Error(await readError(mr, 'Could not load messages'));
        const cp = (await cr.json()) as { conversation: Conversation };
        const mp = (await mr.json()) as { messages: Message[] };
        if (cancelled) return;
        setActiveConversation(cp.conversation);
        setMessages(mp.messages);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unexpected error');
      } finally {
        if (!cancelled) setIsThreadLoading(false);
      }
    }
    void loadThread();
    return () => { cancelled = true; };
  }, [selectedConversationId, user]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    if (!canWrite) { setError('Your role does not allow creating conversations.'); return; }
    setIsCreating(true); setError(null);
    try {
      const r = await fetch('/api/protected/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!r.ok) throw new Error(await readError(r, 'Could not create conversation'));
      const p = (await r.json()) as { conversation: Conversation };
      setConversations((c) => [p.conversation, ...c]);
      setSelectedConversationId(p.conversation.id);
      setNewTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !selectedConversationId) return;
    if (!canWrite) { setError('Your role does not allow sending messages.'); return; }
    setIsSending(true); setError(null);
    try {
      const r = await fetch(
        `/api/protected/conversations/${encodeURIComponent(selectedConversationId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            parts: normalizeMessageParts(undefined, content),
            attachments: [],
          }),
        },
      );
      if (!r.ok) throw new Error(await readError(r, 'Could not send message'));
      const p = (await r.json()) as { message: Message };
      setMessages((m) => [...m, p.message]);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setIsSending(false);
    }
  }

  return {
    user, signOut, loading,
    context, conversations, selectedConversationId, activeConversation,
    messages, newTitle, draft,
    isBootstrapping, isThreadLoading, isCreating, isSending,
    error, canWrite, threadRef,
    setSelectedConversationId, setNewTitle, setDraft,
    handleCreate, handleSend,
  };
}
