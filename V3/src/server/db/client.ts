import { PrismaClient } from '@prisma/client';

declare global {
  var __taskVasilichPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__taskVasilichPrisma__ ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__taskVasilichPrisma__ = prisma;
}
