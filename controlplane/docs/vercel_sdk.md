# Vercel AI SDK and Chat SDK

_Last updated: February 25, 2026 (US)_

## Executive summary

- `Does it call tools?` Yes. The Vercel AI SDK has first-class tool calling in both core generation APIs and chat UI flows.
- `Can it search the web?` Yes, when you explicitly enable a web-search tool/provider. Web browsing is not automatic by default.

## 1) Product map and naming (important)

Vercel currently has three related but distinct things:

1. **AI SDK (`ai-sdk.dev`)**
   - The TypeScript SDK for building AI features.
   - Includes core generation APIs, UI hooks, provider adapters, and tool calling.

2. **Chatbot template (formerly “Chat SDK” in 2025 announcement)**
   - A production-ready Next.js starter app for AI chat products.
   - In April 2025, Vercel introduced this as “Chatbot” and noted it was previously called Chat SDK.

3. **`chat-sdk.dev` (OpenChat)**
   - A separate, framework-agnostic bot development framework.
   - Focuses on platform bot integrations (WhatsApp, Slack, Telegram, etc.), adapters, and data-store integrations.
   - Its docs explicitly point users looking for the chatbot template to the template docs.

## 2) AI SDK: what it includes

### Core runtime layer

The AI SDK core layer provides model-agnostic APIs for:

- text generation (`generateText`, `streamText`)
- structured data/object generation (`generateObject`, etc.)
- embeddings
- provider tools and custom tools

### UI layer

The UI layer (`useChat`, related hooks/components) supports:

- streaming assistant responses
- tool invocation in chat flows
- custom data parts / structured UI data exchange
- resumable streaming patterns

### Provider ecosystem

The SDK supports many providers via provider packages and can also route through **AI Gateway**.

## 3) Tool calling support

Tool calling is a core feature, not an add-on.

You can define tools with schemas and execute functions, then let the model call them during generation. In multi-step agentic flows, you can allow repeated tool/model cycles (for example via `maxSteps`) until the model returns a final answer.

Typical tool-calling model in AI SDK:

- define tool contract (input schema)
- optionally define server-side execute handler
- pass tools to generation/chat call
- handle tool results in stream/UI
- optionally require user approval before tool execution

The chatbot/chat docs also show **tool approval** flows where the UI can present a pending tool action and only continue after explicit user approval.

## 4) Web search support: what is true vs false

### True

- AI SDK apps **can** do web search.
- Web search can be wired through provider-specific tools or gateway/registry tools.

### False

- `useChat` or base AI SDK calls do **not** automatically browse the web.
- If you do not configure a web-search-capable tool, responses are based on model context and your provided data only.

### Common web search paths

1. **OpenAI provider tool**
   - Use OpenAI tool integration (for example `openai.tools.webSearch(...)`) in AI SDK calls.
   - Supports search options such as context size and user location controls.

2. **Anthropic provider tool**
   - AI SDK Anthropic provider exposes web-search tool integration.
   - Docs note constraints (for example direct Anthropic API availability and request behavior details).

3. **AI Gateway built-in tool**
   - AI Gateway supports built-in tools such as Perplexity search (`gateway.tools.perplexitySearch(...)`).

4. **Tools Registry connectors**
   - AI SDK tools registry includes search tools/connectors (e.g., Exa/Perplexity/Parallel integrations) that you can attach to your app.

## 5) Chatbot template (the app starter)

The Chatbot template is intended for teams shipping a real AI chat product quickly. The announcement and template docs emphasize production features such as:

- auth and persistent chats
- streaming UX
- model/provider flexibility
- multimodal support
- shareable chat sessions
- artifact/generative UI workflows
- controlled tool usage patterns (including approval)
- browser-side code execution support in specific artifact workflows

This is a **reference app/template**, not a replacement for the AI SDK runtime APIs.

## 6) `chat-sdk.dev` (OpenChat) at a glance

OpenChat is positioned as a framework-agnostic bot framework:

- unified API over AI models
- adapters for bot frameworks and messaging platforms
- connectors for data stores
- “develop once, deploy everywhere” for multi-platform bot scenarios

Architecture docs describe four building blocks:

- AI model providers
- bot framework runtime
- platform integrations
- data store layer

## 7) When to use which

- Use **AI SDK** if you are building AI features into a web/app backend/frontend and want model/provider abstraction, streaming, structured generation, and tool calling.
- Use the **Chatbot template** if you want a production-ready Next.js chat product scaffold built on AI SDK.
- Use **OpenChat (`chat-sdk.dev`)** if your primary target is cross-platform bot deployment (Slack/WhatsApp/Telegram) with adapter-style architecture.

## 8) Minimal capability answer (for quick reference)

- Tool calling: **Yes** (first-class in AI SDK).
- Web search: **Yes, with configured tools/providers**. Not enabled by default.

## 9) Example (AI SDK + provider web search, conceptual)

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai.responses('gpt-5-mini'),
  prompt: 'What happened in SF last week?',
  tools: {
    web_search: openai.tools.webSearch({
      searchContextSize: 'medium',
    }),
  },
});

console.log(result.text);
```

Notes:

- Exact model IDs and options vary by provider and can change.
- For grounded answers, keep citations/metadata surfaced in your UI when the provider returns them.

## Sources

- Vercel announcement: https://vercel.com/blog/introducing-chatbot
- AI SDK overview/docs: https://ai-sdk.dev/docs/introduction
- AI SDK UI chat + tool usage: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
- AI SDK Core tools/tool-calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- OpenAI provider (AI SDK): https://ai-sdk.dev/providers/ai-sdk-providers/openai
- Anthropic provider (AI SDK): https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- AI Gateway provider docs: https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
- Tools registry: https://ai-sdk.dev/tools-registry
- Chatbot template docs: https://chatbot.ai-sdk.dev/docs/introduction
- OpenChat docs (`chat-sdk.dev`): https://chat-sdk.dev/docs/overview
- OpenChat architecture: https://chat-sdk.dev/docs/architecture
