import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import {
  createWishItem,
  createWishList,
  deleteWishItem,
  deleteWishList,
  getWishlist,
  updateWishItem,
  updateWishList,
} from './service.js';
import {
  createWishItemSchema,
  createWishListSchema,
  updateWishItemSchema,
  updateWishListSchema,
  wishlistEntityIdSchema,
} from './schema.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function sessionFor(request: Request) {
  const session = await getCurrentSessionFromRequest(request);
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export async function handleGetWishlistRequest(request: Request) {
  try {
    const session = await sessionFor(request);
    return json({ ok: true, data: await getWishlist(session.userId, session.workspaceId) });
  } catch (error) {
    return handleWishlistError(error, 'GET_WISHLIST_FAILED');
  }
}

export async function handleCreateWishListRequest(request: Request) {
  try {
    const session = await sessionFor(request);
    const input = createWishListSchema.parse(await request.json());
    return json({ ok: true, data: await createWishList(session.userId, session.workspaceId, input) }, 201);
  } catch (error) {
    return handleWishlistError(error, 'CREATE_WISH_LIST_FAILED');
  }
}

export async function handleUpdateWishListRequest(request: Request, listId: string) {
  try {
    const session = await sessionFor(request);
    const { id } = wishlistEntityIdSchema.parse({ id: listId });
    const input = updateWishListSchema.parse(await request.json());
    return json({ ok: true, data: await updateWishList(session.userId, session.workspaceId, id, input) });
  } catch (error) {
    return handleWishlistError(error, 'UPDATE_WISH_LIST_FAILED');
  }
}

export async function handleDeleteWishListRequest(request: Request, listId: string) {
  try {
    const session = await sessionFor(request);
    const { id } = wishlistEntityIdSchema.parse({ id: listId });
    return json({ ok: true, data: await deleteWishList(session.userId, session.workspaceId, id) });
  } catch (error) {
    return handleWishlistError(error, 'DELETE_WISH_LIST_FAILED');
  }
}

export async function handleCreateWishItemRequest(request: Request) {
  try {
    const session = await sessionFor(request);
    const input = createWishItemSchema.parse(await request.json());
    return json({ ok: true, data: await createWishItem(session.userId, session.workspaceId, input) }, 201);
  } catch (error) {
    return handleWishlistError(error, 'CREATE_WISH_ITEM_FAILED');
  }
}

export async function handleUpdateWishItemRequest(request: Request, itemId: string) {
  try {
    const session = await sessionFor(request);
    const { id } = wishlistEntityIdSchema.parse({ id: itemId });
    const input = updateWishItemSchema.parse(await request.json());
    return json({ ok: true, data: await updateWishItem(session.userId, session.workspaceId, id, input) });
  } catch (error) {
    return handleWishlistError(error, 'UPDATE_WISH_ITEM_FAILED');
  }
}

export async function handleDeleteWishItemRequest(request: Request, itemId: string) {
  try {
    const session = await sessionFor(request);
    const { id } = wishlistEntityIdSchema.parse({ id: itemId });
    return json({ ok: true, data: await deleteWishItem(session.userId, session.workspaceId, id) });
  } catch (error) {
    return handleWishlistError(error, 'DELETE_WISH_ITEM_FAILED');
  }
}

function handleWishlistError(error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return json({ ok: false, error: 'INVALID_WISHLIST_PAYLOAD', details: error.flatten() }, 400);
  }
  if (error instanceof Error) {
    if (error.message === 'UNAUTHORIZED') return json({ ok: false, error: error.message }, 401);
    if (error.message === 'FORBIDDEN_WORKSPACE_ACCESS') return json({ ok: false, error: error.message }, 403);
    if (error.message === 'INSUFFICIENT_WORKSPACE_ROLE') return json({ ok: false, error: error.message }, 403);
    if (error.message === 'WISH_LIST_NOT_FOUND' || error.message === 'WISH_ITEM_NOT_FOUND') {
      return json({ ok: false, error: error.message }, 404);
    }
    return json({ ok: false, error: fallback, message: error.message }, 500);
  }
  return json({ ok: false, error: fallback }, 500);
}
