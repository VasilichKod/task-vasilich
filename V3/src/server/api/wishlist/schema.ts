import { z } from 'zod';

const colorSchema = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const wishStatusSchema = z.enum(['IDEA', 'PLANNED', 'FULFILLED']);

export const wishlistEntityIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const createWishListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: colorSchema,
});

export const updateWishListSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: colorSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createWishItemSchema = z.object({
  listId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(240),
  note: z.string().trim().max(4000).optional().default(''),
  url: z.string().trim().max(2000).optional().default(''),
  priceText: z.string().trim().max(120).optional().default(''),
  status: wishStatusSchema.optional().default('IDEA'),
});

export const updateWishItemSchema = z.object({
  listId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  note: z.string().trim().max(4000).optional(),
  url: z.string().trim().max(2000).optional(),
  priceText: z.string().trim().max(120).optional(),
  status: wishStatusSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateWishListInput = z.infer<typeof createWishListSchema>;
export type UpdateWishListInput = z.infer<typeof updateWishListSchema>;
export type CreateWishItemInput = z.infer<typeof createWishItemSchema>;
export type UpdateWishItemInput = z.infer<typeof updateWishItemSchema>;
