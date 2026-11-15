import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getInventoryByProduct, updateInventory } from '../services/inventoryService.js';
import { assertProductOwnership } from '../services/productService.js';
import { getSellerByUserId } from '../services/sellerService.js';
import { AppError } from '../utils/AppError.js';
import { idParamSchema, inventoryUpdateSchema } from '../validation/schemas.js';

export const inventoryRouter = Router();

const productIdParamSchema = idParamSchema;

inventoryRouter.get(
  '/:id',
  authenticate,
  requireRole('seller', 'admin'),
  validateParams(productIdParamSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    if (req.user.role === 'seller') {
      const seller = await getSellerByUserId(pool, req.user.sub);
      await assertProductOwnership(pool, req.params.id, seller.id);
    }
    const inventory = await getInventoryByProduct(pool, req.params.id);
    res.status(200).json({ inventory });
  }),
);

inventoryRouter.put(
  '/:id',
  authenticate,
  requireRole('seller', 'admin'),
  validateParams(productIdParamSchema),
  validateBody(inventoryUpdateSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    if (req.user.role === 'seller') {
      const seller = await getSellerByUserId(pool, req.user.sub);
      await assertProductOwnership(pool, req.params.id, seller.id);
    }
    const inventory = await updateInventory(pool, req.params.id, req.body);
    res.status(200).json({ inventory });
  }),
);
