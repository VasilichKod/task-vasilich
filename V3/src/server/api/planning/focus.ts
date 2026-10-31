import { z } from 'zod';

export const focusAreaSchema = z.enum([
  'unassigned', 'income', 'growth', 'health', 'family', 'personal', 'life',
]);

type Completion = { isDone: boolean; completedAt: Date | null };

// Old clients omit the new fields. Preserve metadata when they sync planning.
export function resolveCompletionDate(
  input: { done: boolean; completedAt?: string | null },
  previous?: Completion,
  now = new Date(),
) {
  if (!input.done) return null;
  if (input.completedAt) return new Date(input.completedAt);
  if (previous?.isDone) return previous.completedAt;
  // Imported historical completions have no reliable completion timestamp.
  return previous ? now : null;
}
