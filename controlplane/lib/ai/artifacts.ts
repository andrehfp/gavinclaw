import { streamText, type UIMessageStreamWriter } from 'ai';
import type { ArtifactKind } from '@/lib/chat/artifacts';
import type { ChatMessage } from '@/lib/chat/types';
import { getChatModel } from './providers';

const TEXT_ARTIFACT_SYSTEM_PROMPT =
  'You write high-signal markdown artifacts for enterprise control-plane workflows. ' +
  'Use clear section headers and concise language. Do not include preambles.';

const CODE_ARTIFACT_SYSTEM_PROMPT =
  'You generate production-quality code artifacts. Return only code content. ' +
  'Do not wrap output in markdown fences unless explicitly requested.';

type StreamArtifactDraftInput = {
  currentContent?: string;
  instructions: string;
  kind: ArtifactKind;
  selectedChatModel?: string;
  title: string;
  writer: UIMessageStreamWriter<ChatMessage>;
};

function buildPrompt(input: StreamArtifactDraftInput): string {
  if (!input.currentContent) {
    return [
      `Artifact title: ${input.title}`,
      `Artifact type: ${input.kind}`,
      'Task:',
      input.instructions,
      '',
      'Generate the complete artifact content.',
    ].join('\n');
  }

  return [
    `Artifact title: ${input.title}`,
    `Artifact type: ${input.kind}`,
    'Current content:',
    input.currentContent,
    '',
    'Requested update:',
    input.instructions,
    '',
    'Return the fully updated artifact content.',
  ].join('\n');
}

function artifactDeltaType(kind: ArtifactKind): 'data-textDelta' | 'data-codeDelta' {
  return kind === 'code' ? 'data-codeDelta' : 'data-textDelta';
}

export async function streamArtifactDraft(input: StreamArtifactDraftInput): Promise<string> {
  const result = streamText({
    model: getChatModel(input.selectedChatModel),
    system: input.kind === 'code' ? CODE_ARTIFACT_SYSTEM_PROMPT : TEXT_ARTIFACT_SYSTEM_PROMPT,
    prompt: buildPrompt(input),
  });

  let content = '';
  for await (const delta of result.textStream) {
    if (!delta) {
      continue;
    }

    content += delta;
    input.writer.write({
      type: artifactDeltaType(input.kind),
      data: delta,
      transient: true,
    });
  }

  return content.trim();
}
