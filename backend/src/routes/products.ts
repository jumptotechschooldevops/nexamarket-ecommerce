import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  assertProductOwnership,
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
} from '../services/productService.js';
import { getSellerByUserId } from '../services/sellerService.js';
import { AppError } from '../utils/AppError.js';
import {
  idParamSchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
} from '../validation/schemas.js';

export const productsRouter = Router();

productsRouter.get(
  '/',
  optionalAuthenticate,
  validateQuery(productListQuerySchema),
  asyncHandler(async (req, res) => {
    const includeInactive = req.user?.role === 'admin';
    const result = await listProducts(pool, { ...req.query, includeInactive });
    res.status(200).json(result);
  }),
);

productsRouter.get(
  '/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const product = await getProductById(pool, req.params.id);
    res.status(200).json({ product });
  }),
);

productsRouter.post(
  '/',
  authenticate,
  requireRole('seller', 'admin'),
  validateBody(productCreateSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const seller = await getSellerByUserId(pool, req.user.sub);
    const product = await createProduct(pool, {
      sellerId: seller.id,
      categoryId: req.body.categoryId,
      name: req.body.name,
      description: req.body.description,
      priceCents: req.body.priceCents,
      imageUrl: req.body.imageUrl,
      images: req.body.images,
      brand: req.body.brand,
      stock: req.body.stock ?? 0,
    });
    res.status(201).json({ product });
  }),
);

productsRouter.put(
  '/:id',
  authenticate,
  requireRole('seller', 'admin'),
  validateParams(idParamSchema),
  validateBody(productUpdateSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    if (req.user.role === 'seller') {
      const seller = await getSellerByUserId(pool, req.user.sub);
      await assertProductOwnership(pool, req.params.id, seller.id);
    }
    const product = await updateProduct(pool, req.params.id, req.body);
    res.status(200).json({ product });
  }),
);

productsRouter.delete(
  '/:id',
  authenticate,
  requireRole('seller', 'admin'),
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    if (req.user.role === 'seller') {
      const seller = await getSellerByUserId(pool, req.user.sub);
      await assertProductOwnership(pool, req.params.id, seller.id);
    }
    await deleteProduct(pool, req.params.id);
    res.status(204).send();
  }),
);
