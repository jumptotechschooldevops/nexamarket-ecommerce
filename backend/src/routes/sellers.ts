import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listProducts } from '../services/productService.js';
import { listOrdersForSeller } from '../services/orderService.js';
import { getSellerById, getSellerByUserId, getSellerSalesSummary } from '../services/sellerService.js';
import { AppError } from '../utils/AppError.js';
import { idParamSchema, paginationQuerySchema } from '../validation/schemas.js';

export const sellersRouter = Router();

sellersRouter.get(
  '/me',
  authenticate,
  requireRole('seller'),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const seller = await getSellerByUserId(pool, req.user.sub);
    res.status(200).json({ seller });
  }),
);

sellersRouter.get(
  '/me/products',
  authenticate,
  requireRole('seller'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const seller = await getSellerByUserId(pool, req.user.sub);
    const result = await listProducts(pool, { ...req.query, sellerId: seller.id, includeInactive: true });
    res.status(200).json(result);
  }),
);

sellersRouter.get(
  '/me/orders',
  authenticate,
  requireRole('seller'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const seller = await getSellerByUserId(pool, req.user.sub);
    const result = await listOrdersForSeller(pool, seller.id, req.query);
    res.status(200).json(result);
  }),
);

sellersRouter.get(
  '/me/summary',
  authenticate,
  requireRole('seller'),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const seller = await getSellerByUserId(pool, req.user.sub);
    const summary = await getSellerSalesSummary(pool, seller.id);
    res.status(200).json({ summary });
  }),
);

sellersRouter.get(
  '/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const seller = await getSellerById(pool, req.params.id);
    res.status(200).json({ seller });
  }),
);
