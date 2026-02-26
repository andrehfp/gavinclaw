'use client';

import { useMemo, useState } from 'react';
import { formatToolPartForDisplay, getToolApproval } from '@/lib/chat/message-parts';

type ToolApprovalResponse = {
  approved: boolean;
  id: string;
  reason?: string;
};

type ToolPartCardProps = {
  onRespondToApproval?: (response: ToolApprovalResponse) => void;
  part: unknown;
};

const TOOL_STATE_LABELS: Record<string, string> = {
  'approval-requested': 'Needs approval',
  'approval-responded': 'Approval recorded',
  'input-available': 'Prepared',
  'input-streaming': 'Running',
  'output-available': 'Completed',
  'output-denied': 'Denied',
  'output-error': 'Failed',
};

function stateLabel(state: string): string {
  return TOOL_STATE_LABELS[state] ?? state.replace(/-/g, ' ');
}

function prettifyToolName(label: string): string {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .trim();
}

type TextPreview = {
  isTruncated: boolean;
  preview: string;
};

function makePreview(text: string, maxLines = 14, maxChars = 1800): TextPreview {
  const truncatedByChars = text.length > maxChars ? `${text.slice(0, maxChars)}\n...` : text;
  const lines = truncatedByChars.split('\n');
  if (lines.length <= maxLines && truncatedByChars.length === text.length) {
    return {
      isTruncated: false,
      preview: text,
    };
  }

  return {
    isTruncated: true,
    preview: `${lines.slice(0, maxLines).join('\n')}\n...`,
  };
}

function sectionTitle(label: string) {
  return (
    <p
      style={{
        margin: '0 0 6px',
        color: 'var(--muted, #8ca3c0)',
        fontSize: '0.62rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
      }}
    >
      {label}
    </p>
  );
}

export function ToolPartCard({ onRespondToApproval, part }: ToolPartCardProps) {
  const details = formatToolPartForDisplay(part);
  const approval = getToolApproval(part);
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const defaultExpanded = details.state === 'approval-requested';
  const isExpanded = expandedOverride ?? defaultExpanded;
  const inputPreview = useMemo(
    () => makePreview(details.inputText ?? ''),
    [details.inputText],
  );
  const outputPreview = useMemo(
    () => makePreview(details.outputText ?? '', 16, 2400),
    [details.outputText],
  );
  const errorPreview = useMemo(
    () => makePreview(details.errorText ?? '', 12, 1500),
    [details.errorText],
  );

  const hasInput = Boolean(details.inputText && details.inputText.trim().length > 0);
  const hasOutput = Boolean(details.outputText && details.outputText.trim().length > 0);
  const hasError = Boolean(details.errorText && details.errorText.trim().length > 0);
  const showStatusOnly = !hasInput && !hasOutput && !hasError;
  const canApprove = details.state === 'approval-requested' && approval?.id && onRespondToApproval;
  const headerTitle = prettifyToolName(details.label);

  return (
    <div
      style={{
        border: '1px solid var(--main-border, #26354d)',
        background: 'var(--surface, rgba(255,255,255,0.02))',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        aria-expanded={isExpanded}
        onClick={() => {
          setExpandedOverride((current) => {
            const resolvedCurrent = current ?? defaultExpanded;
            return !resolvedCurrent;
          });
        }}
        style={{
          width: '100%',
          border: 0,
          borderBottom: isExpanded ? '1px solid var(--main-border, #26354d)' : 'none',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--muted, #9fb2cc)',
        }}
        type="button"
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text, #c4d4e6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={headerTitle}
          >
            {headerTitle}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--muted, #9fb2cc)',
              whiteSpace: 'nowrap',
            }}
          >
            {stateLabel(details.state)}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: '0.68rem',
            color: 'var(--muted, #9fb2cc)',
            minWidth: 16,
            textAlign: 'right',
          }}
        >
          {isExpanded ? '−' : '+'}
        </span>
      </button>

      {isExpanded ? (
        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: '10px',
          }}
        >
        {hasInput ? (
          <div>
            {sectionTitle('Input')}
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.74rem',
                lineHeight: 1.45,
                color: 'var(--text, #c4d4e6)',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                maxHeight: 180,
                overflow: 'auto',
                padding: '8px',
                border: '1px solid var(--main-border, #26354d)',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--surface, rgba(255,255,255,0.02)) 60%, transparent)',
              }}
            >
              {inputPreview.preview}
            </pre>
            {inputPreview.isTruncated ? (
              <details style={{ marginTop: 6 }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.66rem',
                    color: 'var(--muted, #8ca3c0)',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                >
                  Show full input
                </summary>
                <pre
                  style={{
                    margin: '6px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.74rem',
                    lineHeight: 1.45,
                    color: 'var(--text, #c4d4e6)',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    maxHeight: 260,
                    overflow: 'auto',
                    padding: '8px',
                    border: '1px solid var(--main-border, #26354d)',
                    borderRadius: 6,
                    background: 'color-mix(in srgb, var(--surface, rgba(255,255,255,0.02)) 60%, transparent)',
                  }}
                >
                  {details.inputText}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {hasOutput ? (
          <div>
            {sectionTitle('Output')}
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.74rem',
                lineHeight: 1.45,
                color: 'var(--text, #c4d4e6)',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                maxHeight: 180,
                overflow: 'auto',
                padding: '8px',
                border: '1px solid var(--main-border, #26354d)',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--surface, rgba(255,255,255,0.02)) 60%, transparent)',
              }}
            >
              {outputPreview.preview}
            </pre>
            {outputPreview.isTruncated ? (
              <details style={{ marginTop: 6 }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.66rem',
                    color: 'var(--muted, #8ca3c0)',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                >
                  Show full output
                </summary>
                <pre
                  style={{
                    margin: '6px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.74rem',
                    lineHeight: 1.45,
                    color: 'var(--text, #c4d4e6)',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    maxHeight: 260,
                    overflow: 'auto',
                    padding: '8px',
                    border: '1px solid var(--main-border, #26354d)',
                    borderRadius: 6,
                    background: 'color-mix(in srgb, var(--surface, rgba(255,255,255,0.02)) 60%, transparent)',
                  }}
                >
                  {details.outputText}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {hasError ? (
          <div>
            {sectionTitle('Error')}
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.74rem',
                lineHeight: 1.45,
                color: 'var(--error-text, #e76f51)',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                maxHeight: 180,
                overflow: 'auto',
                padding: '8px',
                border: '1px solid color-mix(in srgb, var(--error-text, #e76f51) 45%, transparent)',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--error-text, #e76f51) 10%, transparent)',
              }}
            >
              {errorPreview.preview}
            </pre>
            {errorPreview.isTruncated ? (
              <details style={{ marginTop: 6 }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.66rem',
                    color: 'var(--muted, #8ca3c0)',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                >
                  Show full error
                </summary>
                <pre
                  style={{
                    margin: '6px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.74rem',
                    lineHeight: 1.45,
                    color: 'var(--error-text, #e76f51)',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    maxHeight: 260,
                    overflow: 'auto',
                    padding: '8px',
                    border: '1px solid color-mix(in srgb, var(--error-text, #e76f51) 45%, transparent)',
                    borderRadius: 6,
                    background: 'color-mix(in srgb, var(--error-text, #e76f51) 10%, transparent)',
                  }}
                >
                  {details.errorText}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {showStatusOnly ? (
          <p
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontSize: '0.74rem',
              lineHeight: 1.45,
              color: 'var(--muted, #9fb2cc)',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            {stateLabel(details.state)}
          </p>
        ) : null}
        </div>
      ) : null}

      {canApprove && isExpanded ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid var(--main-border, #26354d)',
            padding: '8px 10px',
          }}
        >
          <button
            onClick={() => {
              onRespondToApproval({
                id: approval.id,
                approved: false,
                reason: 'User denied action',
              });
            }}
            style={{
              border: '1px solid var(--main-border, #314764)',
              color: 'var(--muted, #9fb2cc)',
              background: 'transparent',
              borderRadius: 6,
              minHeight: 30,
              padding: '0 10px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              cursor: 'pointer',
            }}
            type="button"
          >
            Deny
          </button>
          <button
            onClick={() => {
              onRespondToApproval({
                id: approval.id,
                approved: true,
              });
            }}
            style={{
              border: 0,
              color: '#fff',
              background: 'var(--accent, #e8a617)',
              borderRadius: 6,
              minHeight: 30,
              padding: '0 10px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            type="button"
          >
            Allow
          </button>
        </div>
      ) : null}
    </div>
  );
}
