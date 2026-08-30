import { z } from 'zod';

const colorSchema = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const asanaPreviewRequestSchema = z.object({
  exportData: z.unknown(),
});

const asanaImportTargetSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    projectId: z.string().trim().min(1),
  }),
  z.object({
    mode: z.literal('new'),
    groupId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(120),
    color: colorSchema,
  }),
]);

export const asanaImportRequestSchema = z.object({
  exportData: z.unknown(),
  target: asanaImportTargetSchema,
  asanaAccessToken: z.string().trim().min(1).max(1000).optional(),
  includeCompleted: z.boolean().default(true),
  includeSourceLinks: z.boolean().default(true),
  conflictMode: z.enum(['skip', 'update']).default('skip'),
});

export type AsanaImportInput = z.infer<typeof asanaImportRequestSchema>;
