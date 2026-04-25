import type { Prisma } from '@prisma/client';

import { requireWorkspaceMutationAccess } from '../../auth/workspace-access.js';
import { prisma } from '../../db/client.js';
import type { AchievementsStateInput } from './schema.js';

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

async function loadWorkspaceAchievementState(
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

async function validateAchievementsStateReferences(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: AchievementsStateInput,
) {
  const { groupIds, projectGroupMap } = await loadWorkspaceAchievementState(workspaceId, tx);
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

  Object.values(input.achievements).forEach(projectMap => {
    Object.keys(projectMap).forEach(assertKnownProject);
  });

  Object.values(input.achievementProjects).forEach(groupMap => {
    Object.entries(groupMap).forEach(([groupId, groupedProjectIds]) => {
      assertKnownGroup(groupId);
      groupedProjectIds.forEach(projectId => assertProjectBelongsToGroup(groupId, projectId));
    });
  });
}

async function replaceAchievementsState(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: AchievementsStateInput,
) {
  await validateAchievementsStateReferences(tx, workspaceId, input);

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
  await requireWorkspaceMutationAccess(userId, workspaceId);

  await prisma.$transaction(async tx => {
    await replaceAchievementsState(tx, workspaceId, input);
  });

  return { ok: true };
}
