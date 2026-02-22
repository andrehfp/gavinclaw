import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1);

export const publishPhotoInputSchema = z.object({
  file: nonEmptyString,
  caption: z.string().optional()
});

export const publishVideoInputSchema = z.object({
  file: nonEmptyString,
  caption: z.string().optional()
});

export const publishCarouselInputSchema = z.object({
  files: z.array(nonEmptyString).min(2),
  caption: z.string().optional()
});

export const mediaListInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional()
});

export const commentsListInputSchema = z.object({
  mediaId: nonEmptyString
});

export const commentsReplyInputSchema = z.object({
  commentId: nonEmptyString,
  text: nonEmptyString
});
