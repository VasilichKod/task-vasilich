import type { Prisma } from '@prisma/client';

import { prisma } from '../../db/client.js';
import type { PlanningStateInput } from './schema.js';

async function assertWorkspaceAccess(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    select: {
      role: true,
    },
  });

  if (!membership) {
    throw new Error('FORBIDDEN_WORKSPACE_ACCESS');
  }

  return membership;
}

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

async function replacePlanningState(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: PlanningStateInput,
) {
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
    await tx.backlogTask.createMany({ data: backlogRows });
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
    await tx.weeklyTask.createMany({ data: weeklyRows });
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
    await tx.recurringTask.createMany({ data: recurringRows });
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

export async function savePlanningState(userId: string, workspaceId: string, input: PlanningStateInput) {
  await assertWorkspaceAccess(userId, workspaceId);

  await prisma.$transaction(async tx => {
    await replacePlanningState(tx, workspaceId, input);
  });

  return { ok: true };
}
