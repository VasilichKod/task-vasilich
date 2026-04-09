import { prisma } from '../db/client.js';
import { verifyPassword } from './password.js';
import { createSessionToken, type SessionPayload } from './session.js';
import { loginInputSchema, type LoginInput } from './schema.js';

export async function loginUser(input: LoginInput) {
  const parsedInput = loginInputSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: {
      email: parsedInput.email,
    },
    select: {
      id: true,
      email: true,
      isActive: true,
      passwordHash: true,
      memberships: {
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          workspaceId: true,
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

  if (!user || !user.passwordHash) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new Error('USER_IS_DISABLED');
  }

  const isPasswordValid = await verifyPassword(parsedInput.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const primaryMembership = user.memberships[0];

  if (!primaryMembership) {
    throw new Error('USER_HAS_NO_WORKSPACE');
  }

  const sessionPayload: SessionPayload = {
    userId: user.id,
    workspaceId: primaryMembership.workspaceId,
  };

  const sessionToken = await createSessionToken(sessionPayload);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    workspace: {
      id: primaryMembership.workspace.id,
      name: primaryMembership.workspace.name,
      slug: primaryMembership.workspace.slug,
      role: primaryMembership.role,
    },
    sessionToken,
  };
}
