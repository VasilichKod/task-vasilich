import { prisma } from '../db/client.js';

export async function markUserLogin(userId: string, date = new Date()) {
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastLoginAt: date,
      lastSeenAt: date,
    },
  });
}

export async function markUserSeen(userId: string, date = new Date()) {
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastSeenAt: date,
    },
  });
}
