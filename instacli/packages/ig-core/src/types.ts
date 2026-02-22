import { z } from "zod";

export const providerNameSchema = z.enum(["meta-byo", "central"]);
export type ProviderName = z.infer<typeof providerNameSchema>;

export type GlobalFlags = {
  json: boolean;
  quiet: boolean;
  dryRun: boolean;
};

export type ToolSuccess<T> = {
  ok: true;
  action: string;
  data: T;
};

export type ToolError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ToolResult<T> = ToolSuccess<T> | ToolError;

export const toolErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional()
  })
});

export const toolSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    action: z.string().min(1),
    data: dataSchema
  });

export type AuthStartInput = {
  callbackPort?: number;
  redirectUri?: string;
};

export type AuthStartData = {
  loginUrl: string;
  state: string;
  redirectUri: string;
};

export type AuthFinishInput = {
  code: string;
  state: string;
};

export type PublishPhotoInput = {
  file: string;
  caption?: string;
};

export type PublishVideoInput = {
  file: string;
  caption?: string;
};

export type PublishCarouselInput = {
  files: string[];
  caption?: string;
};

export type MediaListInput = {
  limit?: number;
};

export type CommentsListInput = {
  mediaId: string;
};

export type CommentsReplyInput = {
  commentId: string;
  text: string;
};

export type InsightsPeriod = "day" | "week" | "month";

export type AccountInsights = {
  period: InsightsPeriod;
  followers_count: number;
  media_count: number;
  metrics: {
    reach: number;
    impressions: number;
    profile_views: number;
    accounts_engaged: number;
  };
};

export type MediaInsights = {
  id: string;
  media_type: string;
  permalink: string;
  metrics: {
    reach: number | null;
    impressions: number | null;
    likes: number;
    comments: number;
    saved: number | null;
    shares: number | null;
  };
};

export type TopPostItem = {
  id: string;
  media_type: string;
  permalink: string;
  caption?: string;
  timestamp: string;
  metrics: {
    reach: number | null;
    impressions: number | null;
    likes: number;
    comments: number;
    saved: number | null;
    shares: number | null;
  };
  engagement_score: number;
};

export type InsightsAccountInput = {
  period: InsightsPeriod;
};

export type InsightsMediaInput = {
  id: string;
};

export type AnalyticsTopPostsInput = {
  days: number;
  limit: number;
};
