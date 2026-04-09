import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(32),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().trim().min(1).max(32).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createProjectSchema = z.object({
  groupId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(32),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateProjectSchema = z.object({
  groupId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().trim().min(1).max(32).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const entityIdSchema = z.object({
  id: z.string().trim().min(1),
});
