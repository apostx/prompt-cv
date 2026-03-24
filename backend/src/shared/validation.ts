import { z } from 'zod';

export const googleDocIdSchema = z.string().min(10).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid Google Doc ID format');

export const cvGenerateRequestSchema = z.object({
  templateDocId: googleDocIdSchema,
  data: z.record(z.string(), z.unknown()),
});

export const folderPathSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9._\-/]+$/, 'Invalid folder path format');

export const userSettingsSchema = z.object({
  folderPath: folderPathSchema,
  contextDocId: googleDocIdSchema,
  instructionsDocId: googleDocIdSchema,
  templateDocId: googleDocIdSchema,
  initialized: z.boolean().optional(),
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

export const createDefaultDocSchema = z.object({
  type: z.enum(['instructions', 'template', 'context']),
  folderId: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
});

const setupFieldSchema = z.union([
  z.literal('default'),
  z.object({ id: googleDocIdSchema }),
]);

export const setupInitSchema = z.object({
  folder: z.union([z.literal('default'), z.object({ id: z.string().max(100) })]),
  context: setupFieldSchema,
  instructions: setupFieldSchema,
  template: setupFieldSchema,
});
