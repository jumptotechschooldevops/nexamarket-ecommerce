import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addItemToCart, getCart, removeCartItem, updateCartItem } from '../services/cartService.js';
import { AppError } from '../utils/AppError.js';
import { cartItemAddSchema, cartItemUpdateSchema, idParamSchema } from '../validation/schemas.js';

export const cartRouter = Router();

cartRouter.use(authenticate, requireRole('customer', 'admin'));

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const cart = await getCart(pool, req.user.sub);
    res.status(200).json({ cart });
  }),
);

cartRouter.post(
  '/items',
  validateBody(cartItemAddSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const cart = await addItemToCart(pool, req.user.sub, req.body.productId, req.body.quantity);
    res.status(201).json({ cart });
  }),
);

cartRouter.put(
  '/items/:id',
  validateParams(idParamSchema),
  validateBody(cartItemUpdateSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const cart = await updateCartItem(pool, req.user.sub, req.params.id, req.body.quantity);
    res.status(200).json({ cart });
  }),
);

cartRouter.delete(
  '/items/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const cart = await removeCartItem(pool, req.user.sub, req.params.id);
    res.status(200).json({ cart });
  }),
);
