import { z } from 'zod';

const achievementItemSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1).max(4000),
  date: z.string().trim().max(32).optional().default(''),
});

export const achievementsStateSchema = z.object({
  achievementYears: z.array(z.string().regex(/^\d{4}$/)),
  achievements: z.record(z.string().regex(/^\d{4}$/), z.record(z.string(), z.array(achievementItemSchema))),
  achievementProjects: z.record(z.string().regex(/^\d{4}$/), z.record(z.string(), z.array(z.string().trim().min(1)))),
});

export type AchievementsStateInput = z.infer<typeof achievementsStateSchema>;
