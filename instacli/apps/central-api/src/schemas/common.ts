import { z } from "zod";

export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

export const publishPhotoSchema = z.object({
  file: z.string().min(1),
  caption: z.string().optional()
});

export const publishVideoSchema = z.object({
  file: z.string().min(1),
  caption: z.string().optional()
});

export const publishCarouselSchema = z.object({
  files: z.array(z.string().min(1)).min(2),
  caption: z.string().optional()
});

export const commentsReplySchema = z.object({
  comment: z.string().min(1),
  text: z.string().min(1)
});
