import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getUserById, loginUser, registerUser } from '../services/authService.js';
import { loginSchema, registerSchema } from '../validation/schemas.js';
import { AppError } from '../utils/AppError.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { user, token } = await registerUser(pool, req.body);
    res.status(201).json({ user, token });
  }),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, token } = await loginUser(pool, req.body.email, req.body.password);
    res.status(200).json({ user, token });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const user = await getUserById(pool, req.user.sub);
    res.status(200).json({ user });
  }),
);
