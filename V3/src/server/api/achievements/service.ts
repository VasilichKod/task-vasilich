import type { Prisma } from '@prisma/client';

import { prisma } from '../../db/client.js';
import type { AchievementsStateInput } from './schema.js';

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

async function getProjectSnapshots(workspaceId: string, tx: Prisma.TransactionClient = prisma) {
  const [projects, groups] = await Promise.all([
    tx.project.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        groupId: true,
      },
    }),
    tx.group.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const groupMap = new Map(groups.map(group => [group.id, group.name]));
  return new Map(
    projects.map(project => [
      project.id,
      {
        projectName: project.name,
        groupName: groupMap.get(project.groupId) ?? '',
      },
    ]),
  );
}

async function replaceAchievementsState(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: AchievementsStateInput,
) {
  await tx.achievement.deleteMany({ where: { workspaceId } });
  await tx.achievementPageProject.deleteMany({ where: { workspaceId } });
  await tx.achievementYear.deleteMany({ where: { workspaceId } });

  const projectSnapshots = await getProjectSnapshots(workspaceId, tx);

  const yearRows = input.achievementYears.map((year, index) => ({
    workspaceId,
    achievementYear: Number(year),
    sortOrder: index,
  }));

  if (yearRows.length) {
    await tx.achievementYear.createMany({ data: yearRows });
  }

  const achievementRows = Object.entries(input.achievements).flatMap(([year, projectMap]) =>
    Object.entries(projectMap).flatMap(([projectId, items]) =>
      items.map((item, index) => {
        const snapshot = projectSnapshots.get(projectId);
        return {
          id: item.id,
          workspaceId,
          projectId,
          projectNameSnapshot: snapshot?.projectName ?? '',
          groupNameSnapshot: snapshot?.groupName ?? '',
          achievementYear: Number(year),
          achievementDate: item.date ? new Date(`${item.date}T00:00:00.000Z`) : null,
          title: item.text,
          sortOrder: index,
        };
      }),
    ),
  );

  if (achievementRows.length) {
    await tx.achievement.createMany({ data: achievementRows });
  }

  const achievementProjectRows = Object.entries(input.achievementProjects).flatMap(([year, groupMap]) =>
    Object.entries(groupMap).flatMap(([groupId, projectIds]) =>
      projectIds.map((projectId, index) => {
        const snapshot = projectSnapshots.get(projectId);
        return {
          workspaceId,
          groupId,
          projectId,
          groupNameSnapshot: snapshot?.groupName ?? '',
          projectNameSnapshot: snapshot?.projectName ?? '',
          achievementYear: Number(year),
          sortOrder: index,
        };
      }),
    ),
  );

  if (achievementProjectRows.length) {
    await tx.achievementPageProject.createMany({ data: achievementProjectRows });
  }
}

export async function saveAchievementsState(userId: string, workspaceId: string, input: AchievementsStateInput) {
  await assertWorkspaceAccess(userId, workspaceId);

  await prisma.$transaction(async tx => {
    await replaceAchievementsState(tx, workspaceId, input);
  });

  return { ok: true };
}
