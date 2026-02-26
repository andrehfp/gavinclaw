type UnknownRecord = Record<string, unknown>;

export type MessageAttachment = {
  kind: 'image' | 'file';
  url: string;
  mediaType: string;
  filename?: string;
};

export type FilePartPayload = {
  url: string;
  mediaType: string;
  filename?: string;
};

export function textPart(text: string): UnknownRecord {
  return {
    type: 'text',
    text,
  };
}

export function getTextFromParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }
      const typedPart = part as UnknownRecord;
      if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
        return typedPart.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function getReasoningFromParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return null;
      }

      const typedPart = part as UnknownRecord;
      if (typedPart.type === 'reasoning' && typeof typedPart.text === 'string') {
        return typedPart.text;
      }

      return null;
    })
    .filter((part): part is string => part !== null)
    .join('\n')
    .trim();
}

export function normalizeMessageParts(parts: unknown, fallbackContent?: string): unknown[] {
  if (Array.isArray(parts) && parts.length > 0) {
    return parts;
  }

  const content = (fallbackContent ?? '').trim();
  if (!content) {
    return [];
  }

  return [textPart(content)];
}

export function getFilePart(part: unknown): FilePartPayload | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const typedPart = part as UnknownRecord;
  if (typedPart.type !== 'file') {
    return null;
  }

  const url = typeof typedPart.url === 'string' ? typedPart.url : '';
  if (!url) {
    return null;
  }

  const mediaType =
    typeof typedPart.mediaType === 'string' && typedPart.mediaType.trim().length > 0
      ? typedPart.mediaType
      : 'application/octet-stream';
  const filename = typeof typedPart.filename === 'string' && typedPart.filename.trim().length > 0
    ? typedPart.filename
    : undefined;

  return {
    url,
    mediaType,
    ...(filename ? { filename } : {}),
  };
}

export function isImageMediaType(mediaType: string): boolean {
  return mediaType.startsWith('image/');
}

export function extractAttachmentsFromParts(parts: unknown[]): MessageAttachment[] {
  const attachments: MessageAttachment[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const filePart = getFilePart(part);
    if (!filePart) {
      continue;
    }

    const key = `${filePart.url}|${filePart.mediaType}|${filePart.filename ?? ''}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    attachments.push({
      kind: isImageMediaType(filePart.mediaType) ? 'image' : 'file',
      url: filePart.url,
      mediaType: filePart.mediaType,
      ...(filePart.filename ? { filename: filePart.filename } : {}),
    });
  }

  return attachments;
}

export function getToolState(part: unknown): string | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const typedPart = part as UnknownRecord;
  if (typeof typedPart.state === 'string') {
    return typedPart.state;
  }
  return null;
}

export function isToolPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') {
    return false;
  }
  const typedPart = part as UnknownRecord;
  return (
    typeof typedPart.type === 'string' &&
    (typedPart.type.startsWith('tool-') || typedPart.type === 'dynamic-tool')
  );
}

export function getToolLabel(part: unknown): string {
  if (!part || typeof part !== 'object') {
    return 'Tool';
  }

  const typedPart = part as UnknownRecord;
  if (typeof typedPart.type !== 'string') {
    return 'Tool';
  }

  if (typedPart.type === 'dynamic-tool' && typeof typedPart.toolName === 'string') {
    return typedPart.toolName;
  }

  return typedPart.type.replace(/^tool-/, '');
}

export type ToolApprovalPayload = {
  id: string;
  approved?: boolean;
  reason?: string;
};

export function getToolApproval(part: unknown): ToolApprovalPayload | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const typedPart = part as UnknownRecord;
  if (!typedPart.approval || typeof typedPart.approval !== 'object') {
    return null;
  }

  const approval = typedPart.approval as UnknownRecord;
  if (typeof approval.id !== 'string' || approval.id.trim().length === 0) {
    return null;
  }

  const approved = typeof approval.approved === 'boolean' ? approval.approved : undefined;
  const reason = typeof approval.reason === 'string' && approval.reason.trim().length > 0
    ? approval.reason
    : undefined;

  return {
    id: approval.id,
    ...(approved !== undefined ? { approved } : {}),
    ...(reason ? { reason } : {}),
  };
}

export function getToolInput(part: unknown): unknown | null {
  if (!isToolPart(part) || !part || typeof part !== 'object') {
    return null;
  }

  const typedPart = part as UnknownRecord;
  if ('input' in typedPart && typedPart.input !== undefined) {
    return typedPart.input;
  }

  if ('rawInput' in typedPart && typedPart.rawInput !== undefined) {
    return typedPart.rawInput;
  }

  return null;
}

export function getToolOutput(part: unknown): unknown | null {
  if (!isToolPart(part) || !part || typeof part !== 'object') {
    return null;
  }

  const typedPart = part as UnknownRecord;
  if ('output' in typedPart && typedPart.output !== undefined) {
    return typedPart.output;
  }

  return null;
}

export function getToolError(part: unknown): string | null {
  if (!isToolPart(part) || !part || typeof part !== 'object') {
    return null;
  }

  const typedPart = part as UnknownRecord;
  if (typeof typedPart.errorText === 'string' && typedPart.errorText.trim().length > 0) {
    return typedPart.errorText;
  }

  const state = getToolState(part);
  if (state === 'output-denied') {
    const approval = getToolApproval(part);
    if (approval?.reason) {
      return approval.reason;
    }
    return 'Tool execution denied';
  }

  return null;
}

function stringifyToolPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export type FormattedToolPart = {
  errorText: string | null;
  inputText: string | null;
  label: string;
  outputText: string | null;
  state: string;
};

export function formatToolPartForDisplay(part: unknown): FormattedToolPart {
  const input = getToolInput(part);
  const output = getToolOutput(part);

  return {
    label: getToolLabel(part),
    state: getToolState(part) ?? 'unknown',
    inputText: input === null ? null : stringifyToolPayload(input),
    outputText: output === null ? null : stringifyToolPayload(output),
    errorText: getToolError(part),
  };
}

export function hasVisibleAssistantContent(message: { role?: string; parts?: readonly unknown[] } | null | undefined): boolean {
  if (!message || message.role !== 'assistant' || !Array.isArray(message.parts)) {
    return false;
  }

  return message.parts.some((part) => {
    if (!part || typeof part !== 'object') {
      return false;
    }

    const typedPart = part as UnknownRecord;
    if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
      return typedPart.text.trim().length > 0;
    }

    if (typedPart.type === 'reasoning') {
      if (typeof typedPart.text === 'string' && typedPart.text.trim().length > 0) {
        return true;
      }

      return typedPart.state === 'streaming';
    }

    if (typedPart.type === 'file') {
      return getFilePart(part) !== null;
    }

    return isToolPart(part);
  });
}
