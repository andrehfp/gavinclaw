import type { FileUIPart } from 'ai';

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 1_500_000;
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 3_000_000;
export const ATTACHMENT_INPUT_ACCEPT_ALL =
  'image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rtf';
export const ATTACHMENT_INPUT_ACCEPT_IMAGES = 'image/*';

export type AttachmentSupport = 'none' | 'images-only' | 'files';

const IMAGE_FILE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i;

function attachmentIdentity(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function resolveAttachmentSupport({
  acceptsFiles,
  hasVision,
}: {
  acceptsFiles: boolean;
  hasVision: boolean;
}): AttachmentSupport {
  if (acceptsFiles) {
    return 'files';
  }

  if (hasVision) {
    return 'images-only';
  }

  return 'none';
}

export function getAttachmentInputAccept(support: AttachmentSupport): string {
  if (support === 'files') {
    return ATTACHMENT_INPUT_ACCEPT_ALL;
  }

  return ATTACHMENT_INPUT_ACCEPT_IMAGES;
}

export function getUnsupportedAttachmentMessage(support: AttachmentSupport): string {
  if (support === 'images-only') {
    return 'The selected model only supports image attachments.';
  }

  return 'The selected model does not support file attachments.';
}

export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }

  return IMAGE_FILE_EXTENSION_PATTERN.test(file.name);
}

export function splitAttachmentsBySupport(
  files: readonly File[],
  support: AttachmentSupport,
): { accepted: File[]; rejected: File[] } {
  if (support === 'files') {
    return {
      accepted: [...files],
      rejected: [],
    };
  }

  if (support === 'none') {
    return {
      accepted: [],
      rejected: [...files],
    };
  }

  const accepted: File[] = [];
  const rejected: File[] = [];

  for (const file of files) {
    if (isImageFile(file)) {
      accepted.push(file);
      continue;
    }
    rejected.push(file);
  }

  return {
    accepted,
    rejected,
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

type ClipboardFileItem = {
  kind?: string;
  getAsFile?: () => File | null;
};

type ClipboardDataLike = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardFileItem> | null;
};

export function extractFilesFromClipboardData(clipboardData: ClipboardDataLike | null | undefined): File[] {
  if (!clipboardData) {
    return [];
  }

  const files: File[] = [];
  const seen = new Set<string>();

  const pushIfUnique = (file: File | null | undefined) => {
    if (!file) {
      return;
    }

    const id = attachmentIdentity(file);
    if (seen.has(id)) {
      return;
    }

    seen.add(id);
    files.push(file);
  };

  const directFiles = clipboardData.files ? Array.from(clipboardData.files) : [];
  for (const file of directFiles) {
    pushIfUnique(file);
  }

  const clipboardItems = clipboardData.items ? Array.from(clipboardData.items) : [];
  for (const item of clipboardItems) {
    if (item?.kind !== 'file' || typeof item.getAsFile !== 'function') {
      continue;
    }
    pushIfUnique(item.getAsFile());
  }

  return files;
}

export function validateAttachmentsForMessage({
  existingFiles,
  incomingFiles,
  maxFiles = MAX_ATTACHMENTS_PER_MESSAGE,
  maxFileSizeBytes = MAX_ATTACHMENT_SIZE_BYTES,
  maxTotalSizeBytes = MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
}: {
  existingFiles: readonly File[];
  incomingFiles: readonly File[];
  maxFiles?: number;
  maxFileSizeBytes?: number;
  maxTotalSizeBytes?: number;
}): { accepted: File[]; errors: string[] } {
  const errors: string[] = [];
  const accepted: File[] = [];

  const existingIds = new Set(existingFiles.map((file) => attachmentIdentity(file)));
  let totalBytes = existingFiles.reduce((sum, file) => sum + file.size, 0);
  let totalFiles = existingFiles.length;

  for (const file of incomingFiles) {
    const id = attachmentIdentity(file);

    if (existingIds.has(id)) {
      errors.push(`"${file.name}" is already attached.`);
      continue;
    }

    if (totalFiles >= maxFiles) {
      errors.push(`You can attach up to ${maxFiles} files per message.`);
      break;
    }

    if (file.size > maxFileSizeBytes) {
      errors.push(`"${file.name}" exceeds ${formatFileSize(maxFileSizeBytes)}.`);
      continue;
    }

    if (totalBytes + file.size > maxTotalSizeBytes) {
      errors.push(`Total attachment size must stay under ${formatFileSize(maxTotalSizeBytes)}.`);
      continue;
    }

    existingIds.add(id);
    accepted.push(file);
    totalBytes += file.size;
    totalFiles += 1;
  }

  return { accepted, errors };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error(`Failed to read "${file.name}".`));
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read "${file.name}".`));
    };

    reader.readAsDataURL(file);
  });
}

export async function filesToUIParts(files: readonly File[]): Promise<FileUIPart[]> {
  const uiParts = await Promise.all(
    files.map(async (file) => ({
      type: 'file' as const,
      mediaType: file.type || 'application/octet-stream',
      filename: file.name,
      url: await readFileAsDataUrl(file),
    })),
  );

  return uiParts;
}
