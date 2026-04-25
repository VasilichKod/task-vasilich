import { prisma } from '../db/client.js';
import { hashPassword } from './password.js';
import { createSessionToken, type SessionPayload } from './session.js';
import { registerInputSchema, type RegisterInput } from './schema.js';

function slugifyWorkspaceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function ensureUniqueWorkspaceSlug(baseName: string) {
  const baseSlug = slugifyWorkspaceName(baseName) || 'workspace';

  const existing = await prisma.workspace.findMany({
    where: {
      slug: {
        startsWith: baseSlug,
      },
    },
    select: {
      slug: true,
    },
  });

  const usedSlugs = new Set(existing.map(item => item.slug));

  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export async function registerUser(input: RegisterInput) {
  const parsedInput = registerInputSchema.parse(input);
  const now = new Date();

  const existingUser = await prisma.user.findUnique({
    where: {
      email: parsedInput.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    throw new Error('EMAIL_ALREADY_IN_USE');
  }

  const passwordHash = await hashPassword(parsedInput.password);
  const workspaceSlug = await ensureUniqueWorkspaceSlug(parsedInput.workspaceName);

  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: {
        email: parsedInput.email,
        passwordHash,
        lastLoginAt: now,
        lastSeenAt: now,
        profile: {
          create: {
            name: parsedInput.name,
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: parsedInput.workspaceName,
        slug: workspaceSlug,
        ownerUserId: user.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    await tx.userSetting.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    });

    return {
      user,
      workspace,
    };
  });

  const sessionPayload: SessionPayload = {
    userId: result.user.id,
    workspaceId: result.workspace.id,
  };

  const sessionToken = await createSessionToken(sessionPayload);

  return {
    user: result.user,
    workspace: result.workspace,
    sessionToken,
  };
}
