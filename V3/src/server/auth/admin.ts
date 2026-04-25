import { prisma } from '../db/client.js';
import { getCurrentSessionFromRequest } from './current-user.js';

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdminSession(request: Request) {
  const session = await getCurrentSessionFromRequest(request);

  if (!session) {
    throw new Error('UNAUTHORIZED');
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
    select: {
      id: true,
      email: true,
      isActive: true,
    },
  });

  if (!user?.isActive) {
    throw new Error('UNAUTHORIZED');
  }

  const adminEmails = getAdminEmails();

  if (!adminEmails.has(user.email.toLowerCase())) {
    throw new Error('FORBIDDEN_ADMIN_ACCESS');
  }

  return {
    ...session,
    email: user.email,
  };
}
