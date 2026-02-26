import { z } from 'zod';

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  parts: z.array(z.any()),
});

const userMessageSchema = messageSchema.extend({
  role: z.literal('user'),
});

export const streamRequestBodySchema = z
  .object({
    id: z.string().optional(),
    message: userMessageSchema.optional(),
    messages: z.array(messageSchema).optional(),
    selectedChatModel: z.string().optional(),
  })
  .refine((value) => Boolean(value.message) || Boolean(value.messages?.length), {
    message: 'Either message or messages is required',
    path: ['message'],
  });

export type StreamRequestBody = z.infer<typeof streamRequestBodySchema>;

