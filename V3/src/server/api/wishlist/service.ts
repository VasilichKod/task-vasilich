import { requireWorkspaceAccess, requireWorkspaceMutationAccess } from '../../auth/workspace-access.js';
import { prisma } from '../../db/client.js';
import type {
  CreateWishItemInput,
  CreateWishListInput,
  UpdateWishItemInput,
  UpdateWishListInput,
} from './schema.js';

async function requireWishList(workspaceId: string, listId: string) {
  const list = await prisma.wishList.findFirst({
    where: { id: listId, workspaceId },
  });

  if (!list) throw new Error('WISH_LIST_NOT_FOUND');
  return list;
}

async function requireWishItem(workspaceId: string, itemId: string) {
  const item = await prisma.wishItem.findFirst({
    where: { id: itemId, workspaceId },
  });

  if (!item) throw new Error('WISH_ITEM_NOT_FOUND');
  return item;
}

export async function getWishlist(userId: string, workspaceId: string) {
  await requireWorkspaceAccess(userId, workspaceId);

  const [lists, items] = await Promise.all([
    prisma.wishList.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.wishItem.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  return { lists, items };
}

export async function createWishList(
  userId: string,
  workspaceId: string,
  input: CreateWishListInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  const lastList = await prisma.wishList.findFirst({
    where: { workspaceId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.wishList.create({
    data: {
      workspaceId,
      name: input.name,
      color: input.color,
      sortOrder: (lastList?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateWishList(
  userId: string,
  workspaceId: string,
  listId: string,
  input: UpdateWishListInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireWishList(workspaceId, listId);

  return prisma.wishList.update({
    where: { id: listId },
    data: input,
  });
}

export async function deleteWishList(userId: string, workspaceId: string, listId: string) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireWishList(workspaceId, listId);
  return prisma.wishList.delete({ where: { id: listId } });
}

export async function createWishItem(
  userId: string,
  workspaceId: string,
  input: CreateWishItemInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireWishList(workspaceId, input.listId);
  const lastItem = await prisma.wishItem.findFirst({
    where: { workspaceId, listId: input.listId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.wishItem.create({
    data: {
      workspaceId,
      listId: input.listId,
      title: input.title,
      note: input.note,
      url: input.url,
      priceText: input.priceText,
      status: input.status,
      sortOrder: (lastItem?.sortOrder ?? -1) + 1,
      fulfilledAt: input.status === 'FULFILLED' ? new Date() : null,
    },
  });
}

export async function updateWishItem(
  userId: string,
  workspaceId: string,
  itemId: string,
  input: UpdateWishItemInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  const item = await requireWishItem(workspaceId, itemId);
  if (input.listId) await requireWishList(workspaceId, input.listId);

  const fulfilledAt = input.status === undefined
    ? undefined
    : input.status === 'FULFILLED'
      ? item.fulfilledAt || new Date()
      : null;

  return prisma.wishItem.update({
    where: { id: itemId },
    data: {
      ...input,
      fulfilledAt,
    },
  });
}

export async function deleteWishItem(userId: string, workspaceId: string, itemId: string) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireWishItem(workspaceId, itemId);
  return prisma.wishItem.delete({ where: { id: itemId } });
}
