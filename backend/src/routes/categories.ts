import { Router } from 'express';
import { pool } from '../config/db.js';
import { validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getCategoryById, listCategories } from '../services/categoryService.js';
import { idParamSchema } from '../validation/schemas.js';

export const categoriesRouter = Router();

categoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await listCategories(pool);
    res.status(200).json({ categories });
  }),
);

categoriesRouter.get(
  '/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const category = await getCategoryById(pool, req.params.id);
    res.status(200).json({ category });
  }),
);
