import { z } from 'zod';

type AsanaProjectRef = {
  gid: string;
  name: string;
};

type AsanaSectionRef = {
  gid: string;
  name: string;
};

export type AsanaTask = {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  dueOn: string | null;
  dueAt: string | null;
  permalinkUrl: string;
  memberships: Array<{
    project: AsanaProjectRef | null;
    section: AsanaSectionRef | null;
  }>;
  projects: AsanaProjectRef[];
  subtasks: AsanaTask[];
};

export type ParsedAsanaTask = AsanaTask & {
  sectionSourceId: string;
  sectionName: string;
};

export type ParsedAsanaExport = {
  project: AsanaProjectRef;
  tasks: ParsedAsanaTask[];
  sections: Array<{
    sourceId: string;
    name: string;
    taskCount: number;
  }>;
  completedTaskCount: number;
  subtaskCount: number;
};

const projectRefSchema = z.object({
  gid: z.string().trim().min(1),
  name: z.string().trim().min(1).max(240),
}).passthrough();

const sectionRefSchema = z.object({
  gid: z.string().trim().min(1),
  name: z.string().trim().min(1).max(240),
}).passthrough();

const rawTaskSchema = z.object({
  gid: z.string().trim().min(1),
  name: z.string().default(''),
  notes: z.string().nullish(),
  completed: z.boolean().optional(),
  completed_at: z.string().nullish(),
  created_at: z.string().nullish(),
  modified_at: z.string().nullish(),
  due_on: z.string().nullish(),
  due_at: z.string().nullish(),
  permalink_url: z.string().nullish(),
  memberships: z.array(z.object({
    project: projectRefSchema.nullish(),
    section: sectionRefSchema.nullish(),
  }).passthrough()).optional(),
  projects: z.array(projectRefSchema).optional(),
  subtasks: z.array(z.unknown()).optional(),
}).passthrough();

const exportRootSchema = z.union([
  z.object({ data: z.array(z.unknown()).min(1).max(5000) }).passthrough().transform(value => value.data),
  z.array(z.unknown()).min(1).max(5000),
]);

function parseTask(value: unknown, depth = 0): AsanaTask {
  if (depth > 12) throw new Error('ASANA_NESTING_TOO_DEEP');
  const parsed = rawTaskSchema.parse(value);
  const subtasks = (parsed.subtasks || []).map(item => parseTask(item, depth + 1));
  return {
    gid: parsed.gid,
    name: parsed.name.trim() || 'Без названия',
    notes: parsed.notes || '',
    completed: Boolean(parsed.completed),
    completedAt: parsed.completed_at || null,
    createdAt: parsed.created_at || null,
    modifiedAt: parsed.modified_at || null,
    dueOn: parsed.due_on || null,
    dueAt: parsed.due_at || null,
    permalinkUrl: parsed.permalink_url || '',
    memberships: (parsed.memberships || []).map(item => ({
      project: item.project ? { gid: item.project.gid, name: item.project.name } : null,
      section: item.section ? { gid: item.section.gid, name: item.section.name } : null,
    })),
    projects: (parsed.projects || []).map(item => ({ gid: item.gid, name: item.name })),
    subtasks,
  };
}

function countSubtasks(tasks: AsanaTask[]) {
  let count = 0;
  for (const task of tasks) {
    count += task.subtasks.length;
    count += countSubtasks(task.subtasks);
  }
  return count;
}

function inferProject(tasks: AsanaTask[]) {
  const candidates = new Map<string, { project: AsanaProjectRef; count: number }>();
  for (const task of tasks) {
    const refs = [
      ...task.memberships.map(item => item.project).filter((item): item is AsanaProjectRef => Boolean(item)),
      ...task.projects,
    ];
    const seen = new Set<string>();
    for (const project of refs) {
      if (seen.has(project.gid)) continue;
      seen.add(project.gid);
      const current = candidates.get(project.gid);
      candidates.set(project.gid, { project, count: (current?.count || 0) + 1 });
    }
  }

  const best = [...candidates.values()].sort((a, b) => b.count - a.count)[0];
  if (!best) throw new Error('ASANA_PROJECT_NOT_FOUND');
  return best.project;
}

export function parseAsanaExport(value: unknown): ParsedAsanaExport {
  const rawTasks = exportRootSchema.parse(value);
  const tasks = rawTasks.map(item => parseTask(item));
  const totalNestedTasks = tasks.length + countSubtasks(tasks);
  if (totalNestedTasks > 10000) throw new Error('ASANA_EXPORT_TOO_LARGE');

  const project = inferProject(tasks);
  const fallbackSectionId = `unsectioned:${project.gid}`;
  const parsedTasks: ParsedAsanaTask[] = tasks.map(task => {
    const membership = task.memberships.find(item => item.project?.gid === project.gid)
      || task.memberships.find(item => item.section);
    return {
      ...task,
      sectionSourceId: membership?.section?.gid || fallbackSectionId,
      sectionName: membership?.section?.name || 'Без раздела',
    };
  });

  const sections = new Map<string, { sourceId: string; name: string; taskCount: number }>();
  for (const task of parsedTasks) {
    const current = sections.get(task.sectionSourceId);
    if (current) current.taskCount += 1;
    else sections.set(task.sectionSourceId, {
      sourceId: task.sectionSourceId,
      name: task.sectionName,
      taskCount: 1,
    });
  }

  return {
    project,
    tasks: parsedTasks,
    sections: [...sections.values()],
    completedTaskCount: parsedTasks.filter(task => task.completed).length,
    subtaskCount: countSubtasks(parsedTasks),
  };
}

export function buildAsanaPreview(value: unknown) {
  const parsed = parseAsanaExport(value);
  return {
    projectGid: parsed.project.gid,
    projectName: parsed.project.name,
    taskCount: parsed.tasks.length,
    completedTaskCount: parsed.completedTaskCount,
    openTaskCount: parsed.tasks.length - parsed.completedTaskCount,
    subtaskCount: parsed.subtaskCount,
    sectionCount: parsed.sections.length,
    sections: parsed.sections.map(section => ({ name: section.name, taskCount: section.taskCount })),
  };
}
