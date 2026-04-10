import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  role: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().max(120).optional().default(''),
  about: z.string().trim().max(4000).optional().default(''),
});

export const updateSettingsSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  defaultView: z.enum(['graph', 'tasks', 'wins', 'history', 'profile', 'settings']),
  sidebarCollapsedOnStart: z.boolean(),
  openCurrentYearInAchievements: z.boolean(),
});
