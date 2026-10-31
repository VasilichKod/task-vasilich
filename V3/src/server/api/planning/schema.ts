import { z } from 'zod';
import { focusAreaSchema } from './focus.js';

const taskSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1).max(4000),
  done: z.boolean(),
  note: z.string().max(4000).optional().default(''),
  focusArea: focusAreaSchema.nullable().optional(),
  important: z.boolean().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

const recurringTaskSchema = z.object({
  id: z.string().trim().min(1),
  subId: z.string().trim().min(1),
  dayIdx: z.number().int().min(0).max(6),
  text: z.string().trim().min(1).max(4000),
  focusArea: focusAreaSchema.nullable().optional(),
  important: z.boolean().optional(),
});

const recurringStatusSchema = z.object({
  done: z.boolean(),
  note: z.string().max(4000).optional().default(''),
  completedAt: z.string().datetime().nullable().optional(),
});

export const planningStateSchema = z.object({
  backlog: z.record(z.string(), z.array(taskSchema)),
  taskProjects: z.record(z.string(), z.array(z.string().trim().min(1))),
  recurring: z.array(recurringTaskSchema),
  recurringStatus: z.record(z.string(), z.record(z.string(), recurringStatusSchema)),
  data: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.array(taskSchema)))),
  projectTemplates: z.record(z.string(), z.record(z.string(), z.array(z.string().trim().min(1)))),
  dayProjects: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.array(z.string().trim().min(1))))),
  expectedVersion: z.number().int().optional(),
});

export type PlanningStateInput = z.infer<typeof planningStateSchema>;
