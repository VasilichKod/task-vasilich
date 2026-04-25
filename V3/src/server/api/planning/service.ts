import type { Prisma } from '@prisma/client';

import { requireWorkspaceMutationAccess } from '../../auth/workspace-access.js';
import { prisma } from '../../db/client.js';
import type { PlanningStateInput } from './schema.js';

function parseWeekKeyToDate(weekKey: string) {
  const match = /^w(\d{4})(\d{2})(\d{2})$/.exec(weekKey);

  if (!match) {
    throw new Error(`INVALID_WEEK_KEY:${weekKey}`);
  }

  const [, year, month, day] = match;
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

function normalizeText(value: string | undefined) {
  return value?.trim() ?? '';
}

async function loadWorkspaceProjectState(
  workspaceId: string,
  tx: Prisma.TransactionClient,
) {
  const [groups, projects] = await Promise.all([
    tx.group.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    }),
    tx.project.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
        groupId: true,
      },
    }),
  ]);

  return {
    groupIds: new Set(groups.map(group => group.id)),
    projectGroupMap: new Map(projects.map(project => [project.id, project.groupId])),
  };
}

async function validatePlanningStateReferences(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: PlanningStateInput,
) {
  const { groupIds, projectGroupMap } = await loadWorkspaceProjectState(workspaceId, tx);
  const projectIds = new Set(projectGroupMap.keys());

  const assertKnownGroup = (groupId: string) => {
    if (!groupIds.has(groupId)) {
      throw new Error('GROUP_NOT_FOUND');
    }
  };

  const assertKnownProject = (projectId: string) => {
    if (!projectIds.has(projectId)) {
      throw new Error('PROJECT_NOT_FOUND');
    }
  };

  const assertProjectBelongsToGroup = (groupId: string, projectId: string) => {
    assertKnownGroup(groupId);
    assertKnownProject(projectId);

    if (projectGroupMap.get(projectId) !== groupId) {
      throw new Error('PROJECT_GROUP_MISMATCH');
    }
  };

  Object.keys(input.backlog).forEach(assertKnownProject);
  Object.keys(input.data).forEach(weekKey => parseWeekKeyToDate(weekKey));
  Object.values(input.data).forEach(projectMap => {
    Object.keys(projectMap).forEach(assertKnownProject);
  });
  input.recurring.forEach(task => assertKnownProject(task.subId));

  const recurringTaskIds = new Set(input.recurring.map(task => task.id));
  Object.entries(input.recurringStatus).forEach(([weekKey, statusMap]) => {
    parseWeekKeyToDate(weekKey);
    Object.keys(statusMap).forEach(recurringTaskId => {
      if (!recurringTaskIds.has(recurringTaskId)) {
        throw new Error('INVALID_RECURRING_TASK_REFERENCE');
      }
    });
  });

  Object.entries(input.taskProjects).forEach(([groupId, taskProjectIds]) => {
    assertKnownGroup(groupId);
    taskProjectIds.forEach(projectId => assertProjectBelongsToGroup(groupId, projectId));
  });

  Object.entries(input.projectTemplates).forEach(([groupId, dayMap]) => {
    assertKnownGroup(groupId);
    Object.values(dayMap).forEach(projectIdsForDay => {
      projectIdsForDay.forEach(projectId => assertProjectBelongsToGroup(groupId, projectId));
    });
  });

  Object.entries(input.dayProjects).forEach(([weekKey, groupMap]) => {
    parseWeekKeyToDate(weekKey);
    Object.entries(groupMap).forEach(([groupId, dayMap]) => {
      assertKnownGroup(groupId);
      Object.values(dayMap).forEach(projectIdsForDay => {
        projectIdsForDay.forEach(projectId => assertProjectBelongsToGroup(groupId, projectId));
      });
    });
  });
}

async function replacePlanningState(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: PlanningStateInput,
) {
  await validatePlanningStateReferences(tx, workspaceId, input);

  await tx.recurringTaskStatus.deleteMany({ where: { workspaceId } });
  await tx.weeklyTask.deleteMany({ where: { workspaceId } });
  await tx.backlogTask.deleteMany({ where: { workspaceId } });
  await tx.recurringTask.deleteMany({ where: { workspaceId } });
  await tx.projectTemplate.deleteMany({ where: { workspaceId } });
  await tx.dayProject.deleteMany({ where: { workspaceId } });
  await tx.taskPageProject.deleteMany({ where: { workspaceId } });

  const backlogRows = Object.entries(input.backlog).flatMap(([projectId, tasks]) =>
    tasks.map((task, index) => ({
      id: task.id,
      workspaceId,
      projectId,
      title: task.text,
      note: normalizeText(task.note),
      isDone: Boolean(task.done),
      sortOrder: index,
      archivedAt: null,
    })),
  );

  if (backlogRows.length) {
    const seenBacklogIds = new Set<string>();
    const uniqueBacklogRows = backlogRows.filter(row => {
      if (seenBacklogIds.has(row.id)) return false;
      seenBacklogIds.add(row.id);
      return true;
    });
    await tx.backlogTask.createMany({ data: uniqueBacklogRows });
  }

  const weeklyRows = Object.entries(input.data).flatMap(([wk, projectMap]) =>
    Object.entries(projectMap).flatMap(([projectId, dayMap]) =>
      Object.entries(dayMap).flatMap(([dayIdxValue, tasks]) =>
        tasks.map((task, index) => ({
          id: task.id,
          workspaceId,
          projectId,
          weekStartDate: parseWeekKeyToDate(wk),
          dayIndex: Number(dayIdxValue),
          title: task.text,
          note: normalizeText(task.note),
          isDone: Boolean(task.done),
          sortOrder: index,
          sourceBacklogTaskId: null,
        })),
      ),
    ),
  );

  if (weeklyRows.length) {
    const seenWeeklyIds = new Set<string>();
    const uniqueWeeklyRows = weeklyRows.filter(row => {
      if (seenWeeklyIds.has(row.id)) return false;
      seenWeeklyIds.add(row.id);
      return true;
    });
    await tx.weeklyTask.createMany({ data: uniqueWeeklyRows });
  }

  const recurringRows = input.recurring.map((task, index) => ({
    id: task.id,
    workspaceId,
    projectId: task.subId,
    dayIndex: task.dayIdx,
    title: task.text,
    sortOrder: index,
    archivedAt: null,
  }));

  if (recurringRows.length) {
    const seenRecurringIds = new Set<string>();
    const uniqueRecurringRows = recurringRows.filter(row => {
      if (seenRecurringIds.has(row.id)) return false;
      seenRecurringIds.add(row.id);
      return true;
    });
    await tx.recurringTask.createMany({ data: uniqueRecurringRows });
  }

  const recurringStatusRows = Object.entries(input.recurringStatus).flatMap(([wk, statusMap]) =>
    Object.entries(statusMap).map(([recurringTaskId, status]) => ({
      workspaceId,
      recurringTaskId,
      weekStartDate: parseWeekKeyToDate(wk),
      isDone: Boolean(status.done),
      note: normalizeText(status.note),
    })),
  );

  if (recurringStatusRows.length) {
    await tx.recurringTaskStatus.createMany({ data: recurringStatusRows });
  }

  const templateRows = Object.entries(input.projectTemplates).flatMap(([groupId, dayMap]) =>
    Object.entries(dayMap).flatMap(([dayIdxValue, projectIds]) =>
      projectIds.map((projectId) => ({
        workspaceId,
        groupId,
        projectId,
        dayIndex: Number(dayIdxValue),
        isEnabled: true,
      })),
    ),
  );

  if (templateRows.length) {
    await tx.projectTemplate.createMany({ data: templateRows });
  }

  const dayProjectRows = Object.entries(input.dayProjects).flatMap(([wk, groupMap]) =>
    Object.entries(groupMap).flatMap(([groupId, dayMap]) =>
      Object.entries(dayMap).flatMap(([dayIdxValue, projectIds]) =>
        projectIds.map((projectId, index) => ({
          workspaceId,
          groupId,
          projectId,
          weekStartDate: parseWeekKeyToDate(wk),
          dayIndex: Number(dayIdxValue),
          sortOrder: index,
        })),
      ),
    ),
  );

  if (dayProjectRows.length) {
    await tx.dayProject.createMany({ data: dayProjectRows });
  }

  const taskPageRows = Object.entries(input.taskProjects).flatMap(([groupId, projectIds]) =>
    projectIds.map((projectId, index) => ({
      workspaceId,
      groupId,
      projectId,
      sortOrder: index,
    })),
  );

  if (taskPageRows.length) {
    await tx.taskPageProject.createMany({ data: taskPageRows });
  }
}

export async function savePlanningState(
  userId: string,
  workspaceId: string,
  input: PlanningStateInput & { expectedVersion?: number },
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);

  const newVersion = await prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { planningVersion: true },
    });

    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== workspace.planningVersion
    ) {
      throw new Error('PLANNING_VERSION_CONFLICT');
    }

    await replacePlanningState(tx, workspaceId, input);

    const updated = await tx.workspace.update({
      where: { id: workspaceId },
      data: { planningVersion: workspace.planningVersion + 1 },
      select: { planningVersion: true },
    });

    return updated.planningVersion;
  });

  return { ok: true, version: newVersion };
}
