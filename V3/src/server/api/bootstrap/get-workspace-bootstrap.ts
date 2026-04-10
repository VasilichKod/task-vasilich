import { prisma } from '../../db/client.js';
import {
  type WorkspaceBootstrapInput,
  workspaceBootstrapInputSchema,
} from './schema.js';

function toWeekKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `w${year}${month}${day}`;
}

function buildWeeklyTaskMap(
  tasks: Array<{
    id: string;
    projectId: string;
    weekStartDate: Date;
    dayIndex: number;
    title: string;
    note: string | null;
    isDone: boolean;
  }>,
) {
  const result: Record<string, Record<string, Record<number, Array<{ id: string; text: string; done: boolean; note: string }>>>> = {};

  for (const task of tasks) {
    const weekKey = toWeekKey(task.weekStartDate);
    result[weekKey] ||= {};
    result[weekKey][task.projectId] ||= {};
    result[weekKey][task.projectId][task.dayIndex] ||= [];
    result[weekKey][task.projectId][task.dayIndex].push({
      id: task.id,
      text: task.title,
      done: task.isDone,
      note: task.note ?? '',
    });
  }

  return result;
}

function buildRecurringStatusMap(
  statuses: Array<{
    recurringTaskId: string;
    weekStartDate: Date;
    isDone: boolean;
    note: string | null;
  }>,
) {
  const result: Record<string, Record<string, { done: boolean; note: string }>> = {};

  for (const status of statuses) {
    const weekKey = toWeekKey(status.weekStartDate);
    result[weekKey] ||= {};
    result[weekKey][status.recurringTaskId] = {
      done: status.isDone,
      note: status.note ?? '',
    };
  }

  return result;
}

function buildBacklogMap(
  tasks: Array<{
    id: string;
    projectId: string;
    title: string;
    note: string | null;
    isDone: boolean;
  }>,
) {
  const result: Record<string, Array<{ id: string; text: string; done: boolean; note: string }>> = {};

  for (const task of tasks) {
    result[task.projectId] ||= [];
    result[task.projectId].push({
      id: task.id,
      text: task.title,
      done: task.isDone,
      note: task.note ?? '',
    });
  }

  return result;
}

function buildAchievementsMap(
  items: Array<{
    id: string;
    projectId: string | null;
    achievementYear: number;
    achievementDate: Date | null;
    title: string;
  }>,
) {
  const result: Record<string, Record<string, Array<{ id: string; text: string; date: string }>>> = {};

  for (const item of items) {
    if (!item.projectId) continue;
    const year = String(item.achievementYear);
    result[year] ||= {};
    result[year][item.projectId] ||= [];
    result[year][item.projectId].push({
      id: item.id,
      text: item.title,
      date: item.achievementDate ? item.achievementDate.toISOString().slice(0, 10) : '',
    });
  }

  return result;
}

function buildTaskProjectsMap(
  rows: Array<{
    groupId: string;
    projectId: string;
  }>,
) {
  const result: Record<string, string[]> = {};

  for (const row of rows) {
    result[row.groupId] ||= [];
    result[row.groupId].push(row.projectId);
  }

  return result;
}

function buildAchievementProjectsMap(
  rows: Array<{
    achievementYear: number;
    groupId: string | null;
    projectId: string | null;
  }>,
) {
  const result: Record<string, Record<string, string[]>> = {};

  for (const row of rows) {
    if (!row.groupId || !row.projectId) continue;
    const year = String(row.achievementYear);
    result[year] ||= {};
    result[year][row.groupId] ||= [];
    result[year][row.groupId].push(row.projectId);
  }

  return result;
}

function buildAchievementYears(
  rows: Array<{ achievementYear: number }>,
  achievements: Array<{ achievementYear: number }>,
  achievementPageProjects: Array<{ achievementYear: number }>,
) {
  const years = new Set([
    ...rows.map(row => String(row.achievementYear)),
    ...achievements.map(item => String(item.achievementYear)),
    ...achievementPageProjects.map(item => String(item.achievementYear)),
  ]);

  return Array.from(years).sort((a, b) => Number(b) - Number(a));
}

function buildProjectTemplatesMap(
  rows: Array<{
    groupId: string;
    projectId: string;
    dayIndex: number;
    isEnabled: boolean;
  }>,
) {
  const result: Record<string, Record<number, string[]>> = {};

  for (const row of rows) {
    if (!row.isEnabled) continue;
    result[row.groupId] ||= {};
    result[row.groupId][row.dayIndex] ||= [];
    result[row.groupId][row.dayIndex].push(row.projectId);
  }

  return result;
}

function buildDayProjectsMap(
  rows: Array<{
    weekStartDate: Date;
    groupId: string;
    projectId: string;
    dayIndex: number;
  }>,
) {
  const result: Record<string, Record<string, Record<number, string[]>>> = {};

  for (const row of rows) {
    const weekKey = toWeekKey(row.weekStartDate);
    result[weekKey] ||= {};
    result[weekKey][row.groupId] ||= {};
    result[weekKey][row.groupId][row.dayIndex] ||= [];
    result[weekKey][row.groupId][row.dayIndex].push(row.projectId);
  }

  return result;
}

export async function getWorkspaceBootstrap(input: WorkspaceBootstrapInput) {
  const { userId, workspaceId } = workspaceBootstrapInputSchema.parse(input);

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
    },
    select: {
      role: true,
    },
  });

  if (!membership) {
    throw new Error('FORBIDDEN_WORKSPACE_ACCESS');
  }

  const [
    workspace,
    profile,
    userSettings,
    groups,
    projects,
    weeklyTasks,
    backlogTasks,
    recurringTasks,
    recurringStatuses,
    projectTemplates,
    dayProjects,
    achievements,
    taskPageProjects,
    achievementPageProjects,
    achievementYears,
  ] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
    prisma.profile.findUnique({
      where: { userId },
      select: {
        name: true,
        role: true,
        city: true,
        about: true,
        avatarUrl: true,
      },
    }),
    prisma.userSetting.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      select: {
        defaultView: true,
        sidebarCollapsedOnStart: true,
        openCurrentYearInAchievements: true,
        workspaceNameOverride: true,
      },
    }),
    prisma.group.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        color: true,
      },
    }),
    prisma.project.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        groupId: true,
        color: true,
      },
    }),
    prisma.weeklyTask.findMany({
      where: { workspaceId },
      orderBy: [{ weekStartDate: 'asc' }, { dayIndex: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        projectId: true,
        weekStartDate: true,
        dayIndex: true,
        title: true,
        note: true,
        isDone: true,
      },
    }),
    prisma.backlogTask.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        projectId: true,
        title: true,
        note: true,
        isDone: true,
      },
    }),
    prisma.recurringTask.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ projectId: 'asc' }, { dayIndex: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        projectId: true,
        dayIndex: true,
        title: true,
      },
    }),
    prisma.recurringTaskStatus.findMany({
      where: { workspaceId },
      orderBy: [{ weekStartDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        recurringTaskId: true,
        weekStartDate: true,
        isDone: true,
        note: true,
      },
    }),
    prisma.projectTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ groupId: 'asc' }, { dayIndex: 'asc' }, { createdAt: 'asc' }],
      select: {
        groupId: true,
        projectId: true,
        dayIndex: true,
        isEnabled: true,
      },
    }),
    prisma.dayProject.findMany({
      where: { workspaceId },
      orderBy: [{ weekStartDate: 'asc' }, { groupId: 'asc' }, { dayIndex: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        weekStartDate: true,
        groupId: true,
        projectId: true,
        dayIndex: true,
      },
    }),
    prisma.achievement.findMany({
      where: { workspaceId },
      orderBy: [{ achievementYear: 'desc' }, { achievementDate: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        projectId: true,
        achievementYear: true,
        achievementDate: true,
        title: true,
      },
    }),
    prisma.taskPageProject.findMany({
      where: { workspaceId },
      orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        groupId: true,
        projectId: true,
      },
    }),
    prisma.achievementPageProject.findMany({
      where: { workspaceId },
      orderBy: [{ achievementYear: 'desc' }, { groupId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        achievementYear: true,
        groupId: true,
        projectId: true,
      },
    }),
    prisma.achievementYear.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: 'asc' }, { achievementYear: 'desc' }],
      select: {
        achievementYear: true,
      },
    }),
  ]);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: membership.role,
    },
    profile: {
      name: profile?.name ?? '',
      role: profile?.role ?? '',
      city: profile?.city ?? '',
      about: profile?.about ?? '',
      avatarUrl: profile?.avatarUrl ?? '',
    },
    settings: {
      defaultView: userSettings?.defaultView?.toLowerCase() ?? 'graph',
      sidebarCollapsedOnStart: userSettings?.sidebarCollapsedOnStart ?? false,
      openCurrentYearInAchievements: userSettings?.openCurrentYearInAchievements ?? true,
      workspaceName: userSettings?.workspaceNameOverride ?? workspace.name,
    },
    groups: groups.map(group => ({
      id: group.id,
      label: group.name,
      color: group.color,
    })),
    subs: projects.map(project => ({
      id: project.id,
      label: project.name,
      group: project.groupId,
      color: project.color,
    })),
    recurring: recurringTasks.map(task => ({
      id: task.id,
      subId: task.projectId,
      dayIdx: task.dayIndex,
      text: task.title,
    })),
    recurringStatus: buildRecurringStatusMap(recurringStatuses),
    backlog: buildBacklogMap(backlogTasks),
    taskProjects: buildTaskProjectsMap(taskPageProjects),
    achievements: buildAchievementsMap(achievements),
    achievementProjects: buildAchievementProjectsMap(achievementPageProjects),
    achievementYears: buildAchievementYears(achievementYears, achievements, achievementPageProjects),
    data: buildWeeklyTaskMap(weeklyTasks),
    projectTemplates: buildProjectTemplatesMap(projectTemplates),
    dayProjects: buildDayProjectsMap(dayProjects),
  };
}
