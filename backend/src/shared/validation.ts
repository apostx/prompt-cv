import { z } from 'zod';

export const googleDocIdSchema = z.string().min(10).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid Google Doc ID format');

export const cvGenerateRequestSchema = z.object({
  templateDocId: googleDocIdSchema,
  data: z.record(z.string(), z.unknown()),
});

export const userSettingsSchema = z.object({
  folderPath: z.string().max(200).optional(),
  contextDocId: googleDocIdSchema.optional().or(z.literal('')),
  instructionsDocId: googleDocIdSchema.optional().or(z.literal('')),
  templateDocId: googleDocIdSchema.optional().or(z.literal('')),
});

export const optimizeRequestSchema = z.object({
  documentId: googleDocIdSchema,
  targetPages: z.number().int().min(1).max(20).optional(),
  minMargin: z.number().min(0.3).max(1.5).optional(),
  maxMargin: z.number().min(0.3).max(1.5).optional(),
});

export const docUpdateRequestSchema = z.object({
  content: z.string().min(1).max(5_000_000),
});
