'use client';

import { useEffect, useState } from 'react';
import { copyTextToClipboard } from '@/lib/chat/clipboard';

type CopyStatus = 'idle' | 'copied' | 'error';

const RESET_DELAY_MS = 2000;

type CopyToClipboardButtonProps = {
  text: string;
  className?: string;
  copiedLabel?: string;
  errorLabel?: string;
  idleLabel?: string;
  idleTitle?: string;
};

export function CopyToClipboardButton({
  text,
  className,
  copiedLabel = 'Copied',
  errorLabel = 'Copy failed',
  idleLabel = 'Copy',
  idleTitle = 'Copy',
}: CopyToClipboardButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status === 'idle') {
      return;
    }

    const timer = window.setTimeout(() => {
      setStatus('idle');
    }, RESET_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [status]);

  async function handleCopy(): Promise<void> {
    const copied = await copyTextToClipboard(text);
    setStatus(copied ? 'copied' : 'error');
  }

  const label = status === 'copied' ? copiedLabel : status === 'error' ? errorLabel : idleLabel;

  return (
    <button
      aria-label={label}
      className={className}
      data-copy-status={status}
      disabled={text.length === 0}
      onClick={() => {
        void handleCopy();
      }}
      title={idleTitle}
      type="button"
    >
      {label}
    </button>
  );
}
