import { DefaultView } from '@prisma/client';

import { prisma } from '../../db/client.js';

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
      workspace: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error('FORBIDDEN_WORKSPACE_ACCESS');
  }

  return membership;
}

function mapDefaultView(value: string) {
  switch (value) {
    case 'tasks':
      return DefaultView.TASKS;
    case 'wins':
      return DefaultView.WINS;
    case 'history':
      return DefaultView.HISTORY;
    case 'profile':
      return DefaultView.PROFILE;
    case 'settings':
      return DefaultView.SETTINGS;
    default:
      return DefaultView.GRAPH;
  }
}

async function buildAccountPayload(userId: string, workspaceId: string) {
  const [user, setting, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profile: {
          select: {
            name: true,
            role: true,
            city: true,
            about: true,
            avatarUrl: true,
          },
        },
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
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      select: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        role: true,
      },
    }),
  ]);

  if (!user || !membership) {
    throw new Error('FORBIDDEN_WORKSPACE_ACCESS');
  }

  return {
    profile: {
      name: user.profile?.name ?? '',
      email: user.email ?? '',
      role: user.profile?.role ?? '',
      city: user.profile?.city ?? '',
      about: user.profile?.about ?? '',
      avatarUrl: user.profile?.avatarUrl ?? '',
    },
    settings: {
      defaultView: setting?.defaultView?.toLowerCase() ?? 'graph',
      sidebarCollapsedOnStart: setting?.sidebarCollapsedOnStart ?? false,
      openCurrentYearInAchievements: setting?.openCurrentYearInAchievements ?? true,
      workspaceName: setting?.workspaceNameOverride ?? membership.workspace.name,
    },
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role,
    },
  };
}

export async function getAccount(userId: string, workspaceId: string) {
  await assertWorkspaceAccess(userId, workspaceId);
  return buildAccountPayload(userId, workspaceId);
}

export async function updateProfile(
  userId: string,
  workspaceId: string,
  input: { name: string; email: string; role?: string; city?: string; about?: string },
) {
  await assertWorkspaceAccess(userId, workspaceId);

  const email = input.email.trim().toLowerCase();
  const existingUser = await prisma.user.findFirst({
    where: {
      email,
      NOT: {
        id: userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    throw new Error('EMAIL_ALREADY_IN_USE');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email,
      },
    }),
    prisma.profile.upsert({
      where: {
        userId,
      },
      update: {
        name: input.name,
        role: input.role?.trim() ?? '',
        city: input.city?.trim() ?? '',
        about: input.about?.trim() ?? '',
      },
      create: {
        userId,
        name: input.name,
        role: input.role?.trim() ?? '',
        city: input.city?.trim() ?? '',
        about: input.about?.trim() ?? '',
      },
    }),
  ]);

  return buildAccountPayload(userId, workspaceId);
}

export async function updateSettings(
  userId: string,
  workspaceId: string,
  input: {
    workspaceName: string;
    defaultView: string;
    sidebarCollapsedOnStart: boolean;
    openCurrentYearInAchievements: boolean;
  },
) {
  const membership = await assertWorkspaceAccess(userId, workspaceId);
  const workspaceName = input.workspaceName.trim();
  const workspaceNameOverride = workspaceName === membership.workspace.name ? null : workspaceName;

  await prisma.userSetting.upsert({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    update: {
      defaultView: mapDefaultView(input.defaultView),
      sidebarCollapsedOnStart: input.sidebarCollapsedOnStart,
      openCurrentYearInAchievements: input.openCurrentYearInAchievements,
      workspaceNameOverride,
    },
    create: {
      userId,
      workspaceId,
      defaultView: mapDefaultView(input.defaultView),
      sidebarCollapsedOnStart: input.sidebarCollapsedOnStart,
      openCurrentYearInAchievements: input.openCurrentYearInAchievements,
      workspaceNameOverride,
    },
  });

  return buildAccountPayload(userId, workspaceId);
}
