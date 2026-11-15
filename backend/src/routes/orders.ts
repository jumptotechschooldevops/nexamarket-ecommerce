import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  assertOrderOwnership,
  checkout,
  getOrderById,
  getOrderTracking,
  listOrdersForUser,
  updateOrderStatus,
} from '../services/orderService.js';
import { AppError } from '../utils/AppError.js';
import { checkoutSchema, idParamSchema, orderStatusUpdateSchema, paginationQuerySchema } from '../validation/schemas.js';

export const ordersRouter = Router();

ordersRouter.post(
  '/',
  authenticate,
  requireRole('customer', 'admin'),
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const order = await checkout(pool, req.user.sub, req.body);
    res.status(201).json({ order });
  }),
);

ordersRouter.get(
  '/',
  authenticate,
  requireRole('customer', 'admin'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const result = await listOrdersForUser(pool, req.user.sub, req.query);
    res.status(200).json(result);
  }),
);

ordersRouter.get(
  '/:id',
  authenticate,
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    if (req.user.role !== 'admin') {
      await assertOrderOwnership(pool, req.params.id, req.user.sub);
    }
    const order = await getOrderById(pool, req.params.id);
    res.status(200).json({ order });
  }),
);

ordersRouter.get(
  '/:id/tracking',
  authenticate,
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    if (req.user.role !== 'admin') {
      await assertOrderOwnership(pool, req.params.id, req.user.sub);
    }
    const tracking = await getOrderTracking(pool, req.params.id);
    res.status(200).json({ tracking });
  }),
);

ordersRouter.patch(
  '/:id/status',
  authenticate,
  requireRole('seller', 'admin'),
  validateParams(idParamSchema),
  validateBody(orderStatusUpdateSchema),
  asyncHandler(async (req, res) => {
    const order = await updateOrderStatus(pool, req.params.id, req.body);
    res.status(200).json({ order });
  }),
);
