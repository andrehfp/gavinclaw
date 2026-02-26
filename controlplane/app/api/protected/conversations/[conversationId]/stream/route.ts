import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type DataUIPart,
  type LanguageModelUsage,
  stepCountIs,
  streamText,
} from 'ai';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toChatPipelineError, toUserFacingStreamError } from '@/lib/ai/errors';
import { DEFAULT_CHAT_MODEL, modelSupportsReasoning, modelSupportsToolCalling } from '@/lib/ai/model-catalog';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { getChatModel } from '@/lib/ai/providers';
import { buildChatTools } from '@/lib/ai/tools';
import { extractProviderReportedCostUsd } from '@/lib/ai/usage-cost';
import { extractAttachmentsFromParts, getTextFromParts, normalizeMessageParts } from '@/lib/chat/message-parts';
import type { ChatMessage, ChatMessageDataParts } from '@/lib/chat/types';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { assertChatRateLimit } from '@/lib/server/chat/rate-limit';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse, type ProtectedContext } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';
import { streamRequestBodySchema, type StreamRequestBody } from './schema';

export const maxDuration = 60;

function toUiMessageHistory(
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    parts: unknown[];
  }>,
): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: normalizeMessageParts(message.parts, undefined) as ChatMessage['parts'],
  }));
}

function convertArtifactContextDataPart(part: DataUIPart<ChatMessageDataParts>) {
  if (part.type !== 'data-artifactContext') {
    return undefined;
  }

  return {
    type: 'text' as const,
    text: [
      `Artifact title: ${part.data.title}`,
      `Artifact kind: ${part.data.kind}`,
      `Artifact id: ${part.data.artifactId}`,
      '',
      part.data.content,
    ].join('\n'),
  };
}

type StreamUsageSnapshot = {
  finishReason: string;
  stepCount: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  providerCostUsd?: number;
  providerCostSource?: string;
  providerResponseId?: string;
  usageRaw?: unknown;
  providerMetadata?: unknown;
};

type StreamReasoningProviderOptions = {
  anthropic?: {
    thinking?: {
      type: 'adaptive' | 'disabled' | 'enabled';
      budgetTokens?: number;
    };
  };
  google?: {
    thinkingConfig?: {
      includeThoughts?: boolean;
      thinkingBudget?: number;
    };
  };
  openai?: {
    reasoningSummary?: 'auto' | 'detailed';
  };
};

function toFiniteNumber(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function resolveModelAndProvider(modelId?: string): {
  resolvedModelId: string;
  provider: string;
  providerModelId: string;
} {
  const resolvedModelId = (modelId ?? process.env.AI_CHAT_MODEL ?? DEFAULT_CHAT_MODEL).trim() || DEFAULT_CHAT_MODEL;
  const [providerPart, ...modelParts] = resolvedModelId.split(':');

  if (modelParts.length === 0) {
    return {
      resolvedModelId,
      provider: 'openai',
      providerModelId: providerPart,
    };
  }

  return {
    resolvedModelId,
    provider: providerPart.toLowerCase(),
    providerModelId: modelParts.join(':'),
  };
}

function buildUsageSnapshot({
  finishReason,
  usage,
  stepCount,
  providerResponseId,
  providerMetadata,
  providerCostUsd,
  providerCostSource,
}: {
  finishReason: string;
  usage: LanguageModelUsage;
  stepCount: number;
  providerResponseId?: string;
  providerMetadata?: unknown;
  providerCostUsd?: number;
  providerCostSource?: string;
}): StreamUsageSnapshot {
  const normalizedProviderCostUsd = toFiniteNumber(providerCostUsd);

  return {
    finishReason,
    stepCount,
    inputTokens: toFiniteNumber(usage.inputTokens),
    outputTokens: toFiniteNumber(usage.outputTokens),
    totalTokens: toFiniteNumber(usage.totalTokens),
    reasoningTokens: toFiniteNumber(usage.outputTokenDetails.reasoningTokens ?? usage.reasoningTokens),
    cacheReadTokens: toFiniteNumber(usage.inputTokenDetails.cacheReadTokens),
    cacheWriteTokens: toFiniteNumber(usage.inputTokenDetails.cacheWriteTokens),
    ...(normalizedProviderCostUsd !== undefined ? { providerCostUsd: normalizedProviderCostUsd } : {}),
    ...(providerCostSource ? { providerCostSource } : {}),
    ...(providerResponseId ? { providerResponseId } : {}),
    ...(usage.raw !== undefined ? { usageRaw: usage.raw } : {}),
    ...(providerMetadata !== undefined ? { providerMetadata } : {}),
  };
}

function buildReasoningProviderOptions(provider: string): StreamReasoningProviderOptions {
  if (provider === 'anthropic') {
    return {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      },
    };
  }

  if (provider === 'google') {
    return {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    };
  }

  return {
    openai: {
      reasoningSummary: 'detailed',
    },
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let context: ProtectedContext | undefined;
  let conversationId: string | null = null;
  let auditLogged = false;

  try {
    const authContext = await requireAuthenticatedContext();
    context = authContext;
    ({ conversationId } = await params);
    requireRole(authContext, WRITE_ROLES);

    let body: StreamRequestBody;
    try {
      const json = await request.json();
      body = streamRequestBodySchema.parse(json);
    } catch {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'Invalid stream payload');
    }

    await assertChatRateLimit(authContext);

    const client = getServerConvexClient(context.accessToken);
    const conversation = await client.query(api.conversations.getConversation, {
      conversationId: conversationId as Id<'conversations'>,
    });

    if (!conversation) {
      throw new ApiError(404, 'NOT_FOUND', 'Conversation not found');
    }
    if (conversation.status !== 'open') {
      throw new ApiError(409, 'CONFLICT', 'Conversation is archived. Unarchive it to continue chatting.');
    }

    const isToolApprovalFlow = Array.isArray(body.messages) && body.messages.length > 0;
    let uiMessages: ChatMessage[] = [];

    if (isToolApprovalFlow) {
      uiMessages = body.messages as ChatMessage[];
    } else {
      const currentMessage = body.message;
      if (!currentMessage || currentMessage.role !== 'user') {
        throw new ApiError(400, 'INVALID_ARGUMENT', 'A user message is required');
      }

      const normalizedParts = normalizeMessageParts(currentMessage.parts, undefined);
      if (normalizedParts.length === 0) {
        throw new ApiError(400, 'INVALID_ARGUMENT', 'Message content is required');
      }

      const attachments = extractAttachmentsFromParts(normalizedParts);

      await client.mutation(api.messages.createMessage, {
        conversationId: conversationId as Id<'conversations'>,
        messageId: currentMessage.id,
        role: 'user',
        parts: normalizedParts,
        content: getTextFromParts(normalizedParts),
        attachments,
      });

      const messagesFromDb = await client.query(api.messages.listMessages, {
        conversationId: conversationId as Id<'conversations'>,
      });
      uiMessages = toUiMessageHistory(messagesFromDb);
    }

    const selectedChatModel = body.selectedChatModel?.trim() ? body.selectedChatModel : undefined;
    const { provider, providerModelId, resolvedModelId } = resolveModelAndProvider(selectedChatModel);
    const modelMessages = await convertToModelMessages<ChatMessage>(uiMessages, {
      convertDataPart: convertArtifactContextDataPart,
    });
    let usageSnapshot: StreamUsageSnapshot | null = null;

    const stream = createUIMessageStream<ChatMessage>({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer }) => {
        const tools = modelSupportsToolCalling(selectedChatModel)
          ? buildChatTools({
              client,
              conversationId: conversationId as Id<'conversations'>,
              selectedChatModel,
              writer,
            })
          : undefined;

        const result = streamText({
          model: getChatModel(selectedChatModel),
          system: buildSystemPrompt({
            orgName: authContext.orgName,
            role: authContext.role,
          }),
          messages: modelMessages,
          ...(modelSupportsReasoning(selectedChatModel)
            ? { providerOptions: buildReasoningProviderOptions(provider) }
            : {}),
          ...(tools ? { tools } : {}),
          stopWhen: stepCountIs(6),
          onFinish: (event) => {
            const aggregateCost = extractProviderReportedCostUsd({
              usage: event.totalUsage,
              responseBody: event.response.body,
              responseHeaders: event.response.headers,
              providerMetadata: event.providerMetadata,
            });

            let providerCostUsd = aggregateCost.costUsd ?? undefined;
            let providerCostSource = aggregateCost.source ?? undefined;

            if (providerCostUsd === undefined) {
              const stepCosts = event.steps
                .map((step) => {
                  const extracted = extractProviderReportedCostUsd({
                    usage: step.usage,
                    responseBody: step.response.body,
                    responseHeaders: step.response.headers,
                    providerMetadata: step.providerMetadata,
                  });

                  if (extracted.costUsd === null) {
                    return null;
                  }

                  return extracted;
                })
                .filter((stepCost): stepCost is { costUsd: number; source: string | null } => stepCost !== null);

              if (stepCosts.length > 0) {
                providerCostUsd = stepCosts.reduce((sum, item) => sum + item.costUsd, 0);
                providerCostSource = stepCosts.length === event.steps.length
                  ? 'steps.complete'
                  : 'steps.partial';
              }
            }

            usageSnapshot = buildUsageSnapshot({
              finishReason: event.finishReason,
              usage: event.totalUsage,
              stepCount: event.steps.length,
              providerResponseId: event.response.id,
              providerMetadata: event.providerMetadata,
              providerCostUsd,
              providerCostSource,
            });
          },
        });

        const sendReasoning = modelSupportsReasoning(selectedChatModel);
        writer.merge(result.toUIMessageStream({ sendReasoning }));
      },
      onFinish: async ({ messages: finishedMessages }) => {
        const messagesToPersist = finishedMessages.map((message) => {
          const parts = normalizeMessageParts(message.parts, undefined);
          const attachments = extractAttachmentsFromParts(parts);

          return {
            messageId: message.id,
            role: message.role,
            parts,
            attachments,
            redacted: false,
          };
        });

        if (messagesToPersist.length > 0) {
          await client.mutation(api.messages.upsertMessages, {
            conversationId: conversationId as Id<'conversations'>,
            messages: messagesToPersist,
          });
        }

        if (usageSnapshot) {
          await client.mutation(api.usage.recordQueryUsage, {
            conversationId: conversationId as Id<'conversations'>,
            provider,
            modelId: resolvedModelId,
            providerModelId,
            finishReason: usageSnapshot.finishReason,
            stepCount: usageSnapshot.stepCount,
            ...(usageSnapshot.inputTokens !== undefined ? { inputTokens: usageSnapshot.inputTokens } : {}),
            ...(usageSnapshot.outputTokens !== undefined ? { outputTokens: usageSnapshot.outputTokens } : {}),
            ...(usageSnapshot.totalTokens !== undefined ? { totalTokens: usageSnapshot.totalTokens } : {}),
            ...(usageSnapshot.reasoningTokens !== undefined ? { reasoningTokens: usageSnapshot.reasoningTokens } : {}),
            ...(usageSnapshot.cacheReadTokens !== undefined ? { cacheReadTokens: usageSnapshot.cacheReadTokens } : {}),
            ...(usageSnapshot.cacheWriteTokens !== undefined ? { cacheWriteTokens: usageSnapshot.cacheWriteTokens } : {}),
            ...(usageSnapshot.providerCostUsd !== undefined ? { providerCostUsd: usageSnapshot.providerCostUsd } : {}),
            ...(usageSnapshot.providerCostSource ? { providerCostSource: usageSnapshot.providerCostSource } : {}),
            ...(usageSnapshot.providerResponseId ? { providerResponseId: usageSnapshot.providerResponseId } : {}),
            ...(usageSnapshot.usageRaw !== undefined ? { usageRaw: usageSnapshot.usageRaw } : {}),
            ...(usageSnapshot.providerMetadata !== undefined
              ? { providerMetadata: usageSnapshot.providerMetadata }
              : {}),
          });
        }
      },
      onError: (error) => toUserFacingStreamError(error),
    });

    queueMirrorAuditEvent({
      accessToken: authContext.accessToken,
      orgId: authContext.orgId,
      actorId: authContext.actorUserId,
      action: 'chat.stream',
      resource: 'message',
      status: 'success',
      payload: {
        conversationId,
        toolApprovalFlow: isToolApprovalFlow,
      },
    });
    auditLogged = true;

    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error) {
    if (context && !auditLogged) {
      const status = error instanceof ApiError && error.code === 'FORBIDDEN' ? 'denied' : 'failed';
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'chat.stream',
          resource: 'message',
          status,
          payload: {
            ...(conversationId ? { conversationId } : {}),
            reason: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch {
        // The primary request failure is returned below.
      }
    }

    if (error instanceof ApiError) {
      return toApiErrorResponse(error);
    }

    const pipelineError = toChatPipelineError(error);
    return Response.json(
      {
        error: {
          code: pipelineError.code,
          message: pipelineError.message,
        },
      },
      { status: pipelineError.status },
    );
  }
}
