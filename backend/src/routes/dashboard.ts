import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getAdminDashboardStats } from '../services/dashboardService.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/stats',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const stats = await getAdminDashboardStats(pool);
    res.status(200).json({ stats });
  }),
);
