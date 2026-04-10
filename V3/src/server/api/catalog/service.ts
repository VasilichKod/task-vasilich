import type { Prisma } from '@prisma/client';

import { prisma } from '../../db/client.js';

const NO_GROUP_SYSTEM_KEY = 'NO_GROUP';
const ARCHIVE_RETENTION_DAYS = 30;

function addArchiveDeadline(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() + ARCHIVE_RETENTION_DAYS);
  return result;
}

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

async function ensureNoGroup(workspaceId: string, tx: Prisma.TransactionClient = prisma) {
  const existing = await tx.group.findFirst({
    where: {
      workspaceId,
      systemKey: NO_GROUP_SYSTEM_KEY,
    },
  });

  if (existing) {
    return existing;
  }

  const lastGroup = await tx.group.findFirst({
    where: {
      workspaceId,
    },
    orderBy: {
      sortOrder: 'desc',
    },
    select: {
      sortOrder: true,
    },
  });

  return tx.group.create({
    data: {
      workspaceId,
      name: 'Без группы',
      color: '#A0A0A0',
      isSystem: true,
      systemKey: NO_GROUP_SYSTEM_KEY,
      sortOrder: (lastGroup?.sortOrder ?? -1) + 1,
    },
  });
}

export async function getCatalog(userId: string, workspaceId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const [groups, projects] = await Promise.all([
    prisma.group.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.project.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { groups, projects };
}

export async function getArchivedCatalog(userId: string, workspaceId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const [groups, projects] = await Promise.all([
    prisma.group.findMany({
      where: {
        workspaceId,
        archivedAt: {
          not: null,
        },
      },
      orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.project.findMany({
      where: {
        workspaceId,
        archivedAt: {
          not: null,
        },
      },
      orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
    }),
  ]);

  return { groups, projects };
}

export async function createGroup(
  userId: string,
  workspaceId: string,
  input: { name: string; color: string; sortOrder?: number },
) {
  await assertWorkspaceAccess(userId, workspaceId);

  const lastGroup = await prisma.group.findFirst({
    where: { workspaceId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.group.create({
    data: {
      workspaceId,
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? (lastGroup?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateGroup(
  userId: string,
  workspaceId: string,
  groupId: string,
  input: { name?: string; color?: string; sortOrder?: number },
) {
  await assertWorkspaceAccess(userId, workspaceId);

  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      workspaceId,
    },
  });

  if (!group) {
    throw new Error('GROUP_NOT_FOUND');
  }

  if (group.isSystem && input.name && input.name !== group.name) {
    throw new Error('SYSTEM_GROUP_RENAME_FORBIDDEN');
  }

  return prisma.group.update({
    where: {
      id: groupId,
    },
    data: {
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder,
    },
  });
}

export async function archiveGroup(userId: string, workspaceId: string, groupId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      workspaceId,
    },
  });

  if (!group) {
    throw new Error('GROUP_NOT_FOUND');
  }

  if (group.isSystem) {
    throw new Error('SYSTEM_GROUP_ARCHIVE_FORBIDDEN');
  }

  const now = new Date();
  const deleteAfterAt = addArchiveDeadline(now);

  return prisma.$transaction(async (tx) => {
    const fallbackGroup = await ensureNoGroup(workspaceId, tx);

    await tx.project.updateMany({
      where: {
        workspaceId,
        groupId,
      },
      data: {
        groupId: fallbackGroup.id,
      },
    });

    await tx.projectTemplate.updateMany({
      where: {
        workspaceId,
        groupId,
      },
      data: {
        groupId: fallbackGroup.id,
      },
    });

    await tx.dayProject.updateMany({
      where: {
        workspaceId,
        groupId,
      },
      data: {
        groupId: fallbackGroup.id,
      },
    });

    await tx.taskPageProject.updateMany({
      where: {
        workspaceId,
        groupId,
      },
      data: {
        groupId: fallbackGroup.id,
      },
    });

    await tx.achievementPageProject.updateMany({
      where: {
        workspaceId,
        groupId,
      },
      data: {
        groupId: null,
        groupNameSnapshot: group.name,
      },
    });

    return tx.group.update({
      where: {
        id: groupId,
      },
      data: {
        archivedAt: now,
        deleteAfterAt,
      },
    });
  });
}

export async function restoreGroup(userId: string, workspaceId: string, groupId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      workspaceId,
    },
  });

  if (!group) {
    throw new Error('GROUP_NOT_FOUND');
  }

  return prisma.group.update({
    where: {
      id: groupId,
    },
    data: {
      archivedAt: null,
      deleteAfterAt: null,
    },
  });
}

export async function createProject(
  userId: string,
  workspaceId: string,
  input: { groupId: string; name: string; color: string; sortOrder?: number },
) {
  await assertWorkspaceAccess(userId, workspaceId);

  const group = await prisma.group.findFirst({
    where: {
      id: input.groupId,
      workspaceId,
      archivedAt: null,
    },
  });

  if (!group) {
    throw new Error('GROUP_NOT_FOUND');
  }

  const lastProject = await prisma.project.findFirst({
    where: {
      workspaceId,
      groupId: input.groupId,
    },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.project.create({
    data: {
      workspaceId,
      groupId: input.groupId,
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? (lastProject?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateProject(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: { groupId?: string; name?: string; color?: string; sortOrder?: number },
) {
  await assertWorkspaceAccess(userId, workspaceId);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
    },
  });

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  if (input.groupId) {
    const group = await prisma.group.findFirst({
      where: {
        id: input.groupId,
        workspaceId,
        archivedAt: null,
      },
    });

    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }
  }

  const updatedProject = await prisma.project.update({
    where: {
      id: projectId,
    },
    data: {
      groupId: input.groupId,
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder,
    },
  });

  if (input.groupId && input.groupId !== project.groupId) {
    await prisma.$transaction([
      prisma.projectTemplate.updateMany({
        where: { workspaceId, projectId },
        data: { groupId: input.groupId },
      }),
      prisma.dayProject.updateMany({
        where: { workspaceId, projectId },
        data: { groupId: input.groupId },
      }),
      prisma.taskPageProject.updateMany({
        where: { workspaceId, projectId },
        data: { groupId: input.groupId },
      }),
    ]);
  }

  return updatedProject;
}

export async function archiveProject(userId: string, workspaceId: string, projectId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
    },
    include: {
      group: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  const now = new Date();
  const deleteAfterAt = addArchiveDeadline(now);

  return prisma.$transaction(async (tx) => {
    await tx.weeklyTask.deleteMany({
      where: {
        workspaceId,
        projectId,
      },
    });

    await tx.backlogTask.updateMany({
      where: {
        workspaceId,
        projectId,
      },
      data: {
        archivedAt: now,
      },
    });

    await tx.recurringTask.updateMany({
      where: {
        workspaceId,
        projectId,
      },
      data: {
        archivedAt: now,
      },
    });

    await tx.projectTemplate.deleteMany({
      where: {
        workspaceId,
        projectId,
      },
    });

    await tx.dayProject.deleteMany({
      where: {
        workspaceId,
        projectId,
      },
    });

    await tx.taskPageProject.deleteMany({
      where: {
        workspaceId,
        projectId,
      },
    });

    await tx.achievement.updateMany({
      where: {
        workspaceId,
        projectId,
      },
      data: {
        projectId: null,
        projectNameSnapshot: project.name,
        groupNameSnapshot: project.group.name,
      },
    });

    await tx.achievementPageProject.updateMany({
      where: {
        workspaceId,
        projectId,
      },
      data: {
        projectId: null,
        groupId: null,
        projectNameSnapshot: project.name,
        groupNameSnapshot: project.group.name,
      },
    });

    return tx.project.update({
      where: {
        id: projectId,
      },
      data: {
        archivedAt: now,
        deleteAfterAt,
      },
    });
  });
}

export async function restoreProject(userId: string, workspaceId: string, projectId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
    },
  });

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  return prisma.project.update({
    where: {
      id: projectId,
    },
    data: {
      archivedAt: null,
      deleteAfterAt: null,
    },
  });
}
