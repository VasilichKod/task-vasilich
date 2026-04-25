import { z } from 'zod';

const colorSchema = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: colorSchema,
  sortOrder: z.number().int().min(0).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: colorSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createProjectSchema = z.object({
  groupId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  color: colorSchema,
  sortOrder: z.number().int().min(0).optional(),
});

export const updateProjectSchema = z.object({
  groupId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  color: colorSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const entityIdSchema = z.object({
  id: z.string().trim().min(1),
});
