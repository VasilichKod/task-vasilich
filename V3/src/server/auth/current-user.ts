import { prisma } from '../db/client.js';
import { readSessionTokenFromCookieHeader, verifySessionToken } from './session.js';

export async function getCurrentSessionFromRequest(request: Request) {
  const token = readSessionTokenFromCookieHeader(request.headers.get('cookie'));

  if (!token) {
    return null;
  }

  try {
    const payload = await verifySessionToken(token);

    return {
      userId: payload.userId,
      workspaceId: payload.workspaceId,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUserFromRequest(request: Request) {
  const session = await getCurrentSessionFromRequest(request);

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
    select: {
      id: true,
      email: true,
      isActive: true,
      profile: {
        select: {
          name: true,
          role: true,
          city: true,
          about: true,
          avatarUrl: true,
        },
      },
      memberships: {
        where: {
          workspaceId: session.workspaceId,
        },
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive || !user.memberships[0]) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    profile: {
      name: user.profile?.name ?? '',
      role: user.profile?.role ?? '',
      city: user.profile?.city ?? '',
      about: user.profile?.about ?? '',
      avatarUrl: user.profile?.avatarUrl ?? '',
    },
    workspace: {
      id: user.memberships[0].workspace.id,
      name: user.memberships[0].workspace.name,
      slug: user.memberships[0].workspace.slug,
      role: user.memberships[0].role,
    },
  };
}
