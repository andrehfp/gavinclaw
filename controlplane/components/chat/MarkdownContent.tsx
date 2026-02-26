'use client';

import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyToClipboardButton } from '@/components/chat/CopyToClipboardButton';

type MarkdownContentProps = {
  content: string;
  className?: string;
  components?: Components;
  enableCodeBlockCopy?: boolean;
};

function getCodeTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => getCodeTextFromNode(item)).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getCodeTextFromNode(node.props.children);
  }

  return '';
}

function normalizeCodeText(text: string): string {
  if (text.endsWith('\n')) {
    return text.slice(0, -1);
  }
  return text;
}

function normalizeMarkdownContent(content: string): string {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment;
      }

      return segment
        .replace(
          /^(\s*\d+\.)\s*\n+\s*(?![-+*]\s|\d+\.\s|>\s|```)(\S.*)$/gm,
          '$1 $2',
        )
        .replace(
          /^(\s*[-+*])\s*\n+\s*(?![-+*]\s|\d+\.\s|>\s|```)(\S.*)$/gm,
          '$1 $2',
        );
    })
    .join('');
}

export function MarkdownContent({ content, className, components, enableCodeBlockCopy = false }: MarkdownContentProps) {
  const markdownComponents: Components = {
    table: ({ children, ...props }) => (
      <div className="assistant-table-wrap">
        <table {...props}>{children}</table>
      </div>
    ),
    ...components,
    ...(enableCodeBlockCopy
      ? {
          pre: ({ children, ...props }) => {
            const codeText = normalizeCodeText(getCodeTextFromNode(children));

            return (
              <div className="assistant-code-block">
                <pre {...props}>{children}</pre>
                {codeText.length > 0 ? (
                  <CopyToClipboardButton
                    className="assistant-copy-button assistant-code-copy-button"
                    copiedLabel="Copied"
                    errorLabel="Copy failed"
                    idleLabel="Copy code"
                    idleTitle="Copy code block only"
                    text={codeText}
                  />
                ) : null}
              </div>
            );
          },
        }
      : {}),
  };

  return (
    <div className={className}>
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {normalizeMarkdownContent(content)}
      </ReactMarkdown>
    </div>
  );
}
