import { type Prisma, WorkspaceMemberRole } from '@prisma/client';

import { prisma } from '../db/client.js';

type DbClient = Prisma.TransactionClient | typeof prisma;

const MUTATION_ROLES = new Set<WorkspaceMemberRole>([
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.EDITOR,
]);

export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: string,
  db: DbClient = prisma,
) {
  const membership = await db.workspaceMember.findUnique({
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

export async function requireWorkspaceMutationAccess(
  userId: string,
  workspaceId: string,
  db: DbClient = prisma,
) {
  const membership = await requireWorkspaceAccess(userId, workspaceId, db);

  if (!MUTATION_ROLES.has(membership.role)) {
    throw new Error('INSUFFICIENT_WORKSPACE_ROLE');
  }

  return membership;
}
