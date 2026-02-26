'use client';

import { AlertCircle, Check, Copy, Download, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ArtifactDetail, ArtifactKind, ArtifactSummary, ArtifactVersion } from '@/lib/chat/artifacts';
import { MarkdownContent } from './MarkdownContent';

type ArtifactPanelProps = {
  activeArtifact: ArtifactDetail | null;
  activeArtifactId: string | null;
  activeContent: string;
  activeKind: ArtifactKind | null;
  activeTitle: string;
  artifacts: ArtifactSummary[];
  errorMessage: string | null;
  isLoadingArtifact: boolean;
  isLoadingArtifacts: boolean;
  isOpen: boolean;
  isStreaming: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelectArtifact: (artifactId: string) => void;
  versions: ArtifactVersion[];
};

type ArtifactToast = {
  id: number;
  message: string;
  tone: 'success' | 'error';
};

function formatVersionLabel(version: number): string {
  if (version <= 0) {
    return 'Draft';
  }
  return `v${version}`;
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Falls back to manual copy method below for browsers/context restrictions.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function buildDownloadFilename(title: string, kind: ArtifactKind | null): string {
  const normalized = title
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  const baseName = normalized.length > 0 ? normalized : 'artifact';
  const extension = kind === 'text' ? 'md' : 'txt';
  return `${baseName}.${extension}`;
}

export function ArtifactPanel({
  activeArtifact,
  activeArtifactId,
  activeContent,
  activeKind,
  activeTitle,
  artifacts,
  errorMessage,
  isLoadingArtifact,
  isLoadingArtifacts,
  isOpen,
  isStreaming,
  onClose,
  onRefresh,
  onSelectArtifact,
  versions,
}: ArtifactPanelProps) {
  const [toast, setToast] = useState<ArtifactToast | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  if (!isOpen) {
    return null;
  }

  const hasContent = activeContent.trim().length > 0;
  const kindForActions = activeKind ?? activeArtifact?.kind ?? 'text';
  const copyDisabled = isLoadingArtifact || !hasContent;
  const downloadDisabled = isLoadingArtifact || !hasContent;

  const showToast = (message: string, tone: ArtifactToast['tone']) => {
    setToast({
      id: Date.now(),
      message,
      tone,
    });
  };

  const handleCopy = async () => {
    if (copyDisabled) {
      return;
    }

    const copied = await copyTextToClipboard(activeContent);
    showToast(
      copied ? 'Artifact copied to clipboard.' : 'Copy failed. Check browser permissions and try again.',
      copied ? 'success' : 'error',
    );
  };

  const handleDownload = () => {
    if (downloadDisabled || typeof document === 'undefined') {
      return;
    }

    try {
      const filename = buildDownloadFilename(activeTitle, kindForActions);
      const mimeType = kindForActions === 'code' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
      const blob = new Blob([activeContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${filename}.`, 'success');
    } catch {
      showToast('Download failed. Try again.', 'error');
    }
  };

  return (
    <aside
      style={{
        width: 'min(420px, 92vw)',
        maxWidth: '100%',
        borderLeft: '1px solid var(--main-border, #26354d)',
        background: 'color-mix(in srgb, var(--surface, #111827) 88%, transparent)',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        minHeight: 0,
        position: 'relative',
      }}
    >
      <header
        style={{
          minHeight: 50,
          borderBottom: '1px solid var(--main-border, #26354d)',
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted, #9fb2cc)',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              whiteSpace: 'nowrap',
            }}
          >
            Artifact Panel
          </p>
          {isStreaming ? (
            <span
              style={{
                borderRadius: 999,
                border: '1px solid color-mix(in srgb, var(--accent, #e8a617) 55%, transparent)',
                color: 'var(--accent, #e8a617)',
                background: 'color-mix(in srgb, var(--accent, #e8a617) 16%, transparent)',
                padding: '2px 8px',
                fontSize: '0.58rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
              }}
            >
              streaming
            </span>
          ) : null}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            aria-label="Refresh artifacts"
            onClick={onRefresh}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid var(--main-border, #26354d)',
              background: 'transparent',
              color: 'var(--muted, #9fb2cc)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            type="button"
          >
            <RefreshCw size={13} />
          </button>
          <button
            aria-label="Close artifact panel"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid var(--main-border, #26354d)',
              background: 'transparent',
              color: 'var(--muted, #9fb2cc)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      <div
        style={{
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid var(--main-border, #26354d)',
            padding: '10px',
            minHeight: 0,
          }}
        >
          <p
            style={{
              margin: '0 0 8px',
              color: 'var(--muted, #9fb2cc)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            Conversation Artifacts
          </p>
          {isLoadingArtifacts ? (
            <p
              style={{
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--muted, #9fb2cc)',
                fontSize: '0.72rem',
              }}
            >
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              Loading artifacts...
            </p>
          ) : artifacts.length === 0 ? (
            <p
              style={{
                margin: 0,
                color: 'var(--muted, #9fb2cc)',
                fontSize: '0.72rem',
              }}
            >
              No artifacts yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {artifacts.map((artifact) => {
                const isActive = activeArtifactId === artifact.id;
                return (
                  <button
                    key={artifact.id}
                    onClick={() => onSelectArtifact(artifact.id)}
                    style={{
                      border: `1px solid ${
                        isActive
                          ? 'color-mix(in srgb, var(--accent, #e8a617) 55%, transparent)'
                          : 'var(--main-border, #26354d)'
                      }`,
                      background: isActive
                        ? 'color-mix(in srgb, var(--accent, #e8a617) 12%, transparent)'
                        : 'transparent',
                      borderRadius: 8,
                      padding: '8px 10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    type="button"
                  >
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text, #d9e4f2)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                      title={artifact.title}
                    >
                      {artifact.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        color: 'var(--muted, #9fb2cc)',
                        fontSize: '0.64rem',
                        fontFamily: 'var(--font-ibm-plex-mono), monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {artifact.kind} · {formatVersionLabel(artifact.latestVersion)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            minHeight: 0,
            overflow: 'auto',
            padding: '12px 10px',
            display: 'grid',
            gap: 10,
            alignContent: 'start',
          }}
        >
          <div
            style={{
              border: '1px solid var(--main-border, #26354d)',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--surface, #111827) 66%, transparent)',
              padding: '10px',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text, #d9e4f2)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    lineHeight: 1.35,
                  }}
                  title={activeTitle}
                >
                  {activeTitle}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    color: 'var(--muted, #9fb2cc)',
                    fontSize: '0.62rem',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {kindForActions} · {formatVersionLabel(activeArtifact?.latestVersion ?? 0)}
                </p>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  aria-label="Copy artifact content"
                  disabled={copyDisabled}
                  onClick={() => {
                    void handleCopy();
                  }}
                  style={{
                    border: '1px solid var(--main-border, #26354d)',
                    background: 'transparent',
                    color: 'var(--muted, #9fb2cc)',
                    borderRadius: 7,
                    height: 26,
                    padding: '0 8px',
                    fontSize: '0.66rem',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: copyDisabled ? 'not-allowed' : 'pointer',
                    opacity: copyDisabled ? 0.55 : 1,
                  }}
                  type="button"
                >
                  <Copy size={12} />
                  Copy
                </button>
                <button
                  aria-label="Download artifact content"
                  disabled={downloadDisabled}
                  onClick={handleDownload}
                  style={{
                    border: '1px solid var(--main-border, #26354d)',
                    background: 'transparent',
                    color: 'var(--muted, #9fb2cc)',
                    borderRadius: 7,
                    height: 26,
                    padding: '0 8px',
                    fontSize: '0.66rem',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: downloadDisabled ? 'not-allowed' : 'pointer',
                    opacity: downloadDisabled ? 0.55 : 1,
                  }}
                  type="button"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>
            </div>

            {isLoadingArtifact ? (
              <p
                style={{
                  margin: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--muted, #9fb2cc)',
                  fontSize: '0.72rem',
                }}
              >
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                Loading content...
              </p>
            ) : activeContent.trim().length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--muted, #9fb2cc)',
                  fontSize: '0.76rem',
                }}
              >
                No content yet.
              </p>
            ) : activeKind === 'code' ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  border: '1px solid var(--main-border, #26354d)',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--surface, #111827) 74%, transparent)',
                  padding: '10px',
                  color: 'var(--text, #d9e4f2)',
                  fontSize: '0.76rem',
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                }}
              >
                {activeContent}
              </pre>
            ) : (
              <MarkdownContent content={activeContent} />
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--main-border, #26354d)',
            padding: '10px',
            display: 'grid',
            gap: 6,
          }}
        >
          <p
            style={{
              margin: 0,
              color: 'var(--muted, #9fb2cc)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            Recent Versions
          </p>
          {versions.length === 0 ? (
            <p
              style={{
                margin: 0,
                color: 'var(--muted, #9fb2cc)',
                fontSize: '0.72rem',
              }}
            >
              No saved versions.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 4, maxHeight: 120, overflow: 'auto' }}>
              {versions.slice(0, 8).map((version) => (
                <p
                  key={version.id}
                  style={{
                    margin: 0,
                    color: 'var(--muted, #9fb2cc)',
                    fontSize: '0.67rem',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                >
                  {formatVersionLabel(version.version)}
                  {version.changeSummary ? ` · ${version.changeSummary}` : ''}
                </p>
              ))}
            </div>
          )}
          {errorMessage ? (
            <p
              style={{
                margin: 0,
                borderRadius: 8,
                border: '1px solid color-mix(in srgb, var(--error-text, #e76f51) 40%, transparent)',
                background: 'color-mix(in srgb, var(--error-text, #e76f51) 8%, transparent)',
                color: 'var(--error-text, #e76f51)',
                fontSize: '0.7rem',
                lineHeight: 1.45,
                padding: '8px 9px',
              }}
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
      {toast ? (
        <div
          aria-live="polite"
          role="status"
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            maxWidth: 'calc(100% - 20px)',
            borderRadius: 8,
            border:
              toast.tone === 'success'
                ? '1px solid color-mix(in srgb, #31c48d 42%, transparent)'
                : '1px solid color-mix(in srgb, var(--error-text, #e76f51) 42%, transparent)',
            background:
              toast.tone === 'success'
                ? 'color-mix(in srgb, #31c48d 16%, var(--surface, #111827) 84%)'
                : 'color-mix(in srgb, var(--error-text, #e76f51) 12%, var(--surface, #111827) 88%)',
            color: toast.tone === 'success' ? '#7ff3cb' : 'var(--error-text, #e76f51)',
            fontSize: '0.69rem',
            lineHeight: 1.35,
            padding: '7px 9px',
            display: 'inline-flex',
            gap: 7,
            alignItems: 'center',
            boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
            pointerEvents: 'none',
          }}
        >
          {toast.tone === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </aside>
  );
}
