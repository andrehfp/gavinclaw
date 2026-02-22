import type {
  AccountInsights,
  AnalyticsTopPostsInput,
  AuthFinishInput,
  AuthStartInput,
  CommentsListInput,
  CommentsReplyInput,
  InsightsAccountInput,
  InsightsMediaInput,
  MediaListInput,
  MediaInsights,
  ProviderName,
  PublishCarouselInput,
  PublishPhotoInput,
  PublishVideoInput,
  TopPostItem,
  ToolResult
} from "./types.js";
import type { CliStore } from "./storage.js";

export type Logger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

export type ProviderContext = {
  store: CliStore;
  logger: Logger;
  dryRun: boolean;
  accountName?: string;
};

export type Provider = {
  name: ProviderName;
  auth: {
    start: (input?: AuthStartInput) => Promise<ToolResult<{ loginUrl: string; state: string; redirectUri: string }>>;
    finish: (input: AuthFinishInput) => Promise<ToolResult<{ authenticated: boolean; provider: ProviderName }>>;
    status: () => Promise<ToolResult<{ authenticated: boolean; provider: ProviderName }>>;
    logout: () => Promise<ToolResult<{ loggedOut: boolean; provider: ProviderName }>>;
  };
  publish: {
    photo: (input: PublishPhotoInput) => Promise<ToolResult<{ media_id: string; status: string }>>;
    video: (input: PublishVideoInput) => Promise<ToolResult<{ media_id: string; status: string }>>;
    carousel: (input: PublishCarouselInput) => Promise<ToolResult<{ media_id: string; status: string }>>;
  };
  media: {
    list: (input: MediaListInput) => Promise<ToolResult<{ items: readonly unknown[]; next?: string; next_cursor?: string }>>;
  };
  comments: {
    list: (input: CommentsListInput) => Promise<ToolResult<{ items: readonly unknown[] }>>;
    reply: (input: CommentsReplyInput) => Promise<ToolResult<{ reply_id: string; status: string }>>;
  };
  insights: {
    account: (input: InsightsAccountInput) => Promise<ToolResult<AccountInsights>>;
    media: (input: InsightsMediaInput) => Promise<ToolResult<MediaInsights>>;
  };
  analytics: {
    topPosts: (input: AnalyticsTopPostsInput) => Promise<ToolResult<{ days: number; limit: number; items: TopPostItem[] }>>;
  };
};
