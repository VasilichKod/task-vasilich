import { z } from 'zod';

export const projectNoteIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const createProjectNoteSchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().max(50000).optional().default(''),
});

export const updateProjectNoteSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().max(50000).optional(),
}).refine(input => input.title !== undefined || input.body !== undefined, {
  message: 'At least one field must be provided',
});

export type CreateProjectNoteInput = z.infer<typeof createProjectNoteSchema>;
export type UpdateProjectNoteInput = z.infer<typeof updateProjectNoteSchema>;
