import { z } from 'zod';

type AsanaProjectRef = {
  gid: string;
  name: string;
};

type AsanaSectionRef = {
  gid: string;
  name: string;
};

export type AsanaComment = {
  gid: string;
  text: string;
  authorName: string;
  createdAt: string | null;
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
  comments: AsanaComment[];
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
  commentCount: number;
};

const projectRefSchema = z.object({
  gid: z.string().trim().min(1),
  name: z.string().trim().min(1).max(240),
}).passthrough();

const sectionRefSchema = z.object({
  gid: z.string().trim().min(1),
  name: z.string().trim().min(1).max(240),
}).passthrough();

const rawCommentSchema = z.object({
  gid: z.string().nullish(),
  resource_subtype: z.string().nullish(),
  type: z.string().nullish(),
  text: z.string().nullish(),
  html_text: z.string().nullish(),
  created_at: z.string().nullish(),
  created_by: z.object({
    name: z.string().nullish(),
  }).passthrough().nullish(),
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
  stories: z.array(z.unknown()).optional(),
  comments: z.array(z.unknown()).optional(),
  subtasks: z.array(z.unknown()).optional(),
}).passthrough();

const exportRootSchema = z.union([
  z.object({ data: z.array(z.unknown()).min(1).max(5000) }).passthrough().transform(value => value.data),
  z.array(z.unknown()).min(1).max(5000),
]);

function htmlToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function parseComment(value: unknown, assumeComment: boolean): AsanaComment | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return assumeComment && text ? { gid: '', text, authorName: '', createdAt: null } : null;
  }

  const result = rawCommentSchema.safeParse(value);
  if (!result.success) return null;
  const parsed = result.data;
  const isComment = assumeComment
    || parsed.resource_subtype === 'comment_added'
    || parsed.type === 'comment';
  if (!isComment) return null;

  const text = (parsed.text || htmlToPlainText(parsed.html_text || '')).trim();
  if (!text) return null;
  return {
    gid: parsed.gid || '',
    text,
    authorName: parsed.created_by?.name?.trim() || '',
    createdAt: parsed.created_at || null,
  };
}

function parseComments(stories: unknown[], comments: unknown[]) {
  const parsed = [
    ...stories.map(item => parseComment(item, false)),
    ...comments.map(item => parseComment(item, true)),
  ].filter((item): item is AsanaComment => Boolean(item));
  const seen = new Set<string>();
  return parsed.filter(comment => {
    const key = comment.gid || `${comment.createdAt || ''}\n${comment.authorName}\n${comment.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseAsanaStoryComments(stories: unknown[]) {
  return parseComments(stories, []);
}

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
    comments: parseComments(parsed.stories || [], parsed.comments || []),
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

function countComments(tasks: AsanaTask[]): number {
  return tasks.reduce(
    (total, task) => total + task.comments.length + countComments(task.subtasks),
    0,
  );
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
    commentCount: countComments(parsedTasks),
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
    commentCount: parsed.commentCount,
    sectionCount: parsed.sections.length,
    sections: parsed.sections.map(section => ({ name: section.name, taskCount: section.taskCount })),
  };
}
