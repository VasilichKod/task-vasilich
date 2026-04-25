import { z } from 'zod';

export const workspaceBootstrapInputSchema = z.object({
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
});

export type WorkspaceBootstrapInput = z.infer<typeof workspaceBootstrapInputSchema>;
