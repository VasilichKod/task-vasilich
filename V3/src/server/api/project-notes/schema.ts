import { z } from 'zod';

export const projectNoteIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const createProjectNoteSchema = z.object({
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(240),
  body: z.string().max(50000).optional().default(''),
});

export const updateProjectNoteSchema = z.object({
  sectionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().max(50000).optional(),
}).refine(input => input.sectionId !== undefined || input.title !== undefined || input.body !== undefined, {
  message: 'At least one field must be provided',
});

export const createProjectNoteSectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateProjectNoteSectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const deleteProjectNoteSectionSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('move'),
    targetSectionId: z.string().trim().min(1),
  }),
  z.object({
    mode: z.literal('delete'),
  }),
]);

const orderedIdListSchema = z.array(z.string().trim().min(1)).max(200).refine(
  ids => new Set(ids).size === ids.length,
  { message: 'IDs must be unique' },
);

export const reorderProjectNotesSchema = z.object({
  sectionIds: orderedIdListSchema,
  notes: z.array(z.object({
    id: z.string().trim().min(1),
    sectionId: z.string().trim().min(1),
  })).max(2000).refine(
    notes => new Set(notes.map(note => note.id)).size === notes.length,
    { message: 'Note IDs must be unique' },
  ),
});

export type CreateProjectNoteInput = z.infer<typeof createProjectNoteSchema>;
export type UpdateProjectNoteInput = z.infer<typeof updateProjectNoteSchema>;
export type CreateProjectNoteSectionInput = z.infer<typeof createProjectNoteSectionSchema>;
export type UpdateProjectNoteSectionInput = z.infer<typeof updateProjectNoteSectionSchema>;
export type DeleteProjectNoteSectionInput = z.infer<typeof deleteProjectNoteSectionSchema>;
export type ReorderProjectNotesInput = z.infer<typeof reorderProjectNotesSchema>;
