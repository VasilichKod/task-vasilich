import { prisma } from '../../db/client.js';

function subtractDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getAdminStats() {
  const cutoff7d = subtractDays(7);
  const cutoff30d = subtractDays(30);

  const [
    totalUsers,
    activeUsers,
    usersWithWorkspace,
    usersLoggedInEver,
    usersSeen7d,
    usersSeen30d,
    newUsers7d,
    newUsers30d,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        isActive: true,
      },
    }),
    prisma.user.count({
      where: {
        memberships: {
          some: {},
        },
      },
    }),
    prisma.user.count({
      where: {
        lastLoginAt: {
          not: null,
        },
      },
    }),
    prisma.user.count({
      where: {
        lastSeenAt: {
          gte: cutoff7d,
        },
      },
    }),
    prisma.user.count({
      where: {
        lastSeenAt: {
          gte: cutoff30d,
        },
      },
    }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: cutoff7d,
        },
      },
    }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: cutoff30d,
        },
      },
    }),
    prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 12,
      select: {
        id: true,
        email: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        lastSeenAt: true,
        memberships: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    }),
  ]);

  return {
    summary: {
      totalUsers,
      activeUsers,
      usersWithWorkspace,
      usersLoggedInEver,
      usersSeen7d,
      usersSeen30d,
      newUsers7d,
      newUsers30d,
    },
    recentUsers: recentUsers.map(user => ({
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      workspaces: user.memberships.map(membership => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        role: membership.role,
      })),
    })),
  };
}
