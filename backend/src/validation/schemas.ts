import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  fullName: z.string().min(2).max(120),
  role: z.enum(['customer', 'seller']).optional(),
  storeName: z.string().min(2).max(150).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const productListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: z.string().uuid().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'rating']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sellerId: z.string().uuid().optional(),
});

export const productCreateSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10),
  categoryId: z.string().uuid(),
  priceCents: z.number().int().min(0),
  imageUrl: z.string().url(),
  images: z.array(z.string().url()).optional(),
  brand: z.string().min(1).max(100).optional(),
  stock: z.number().int().min(0).default(0),
});

export const productUpdateSchema = productCreateSchema.partial();

export const idParamSchema = z.object({ id: z.string().uuid() });

export const inventoryUpdateSchema = z.object({
  quantity: z.number().int().min(0).optional(),
  reorderThreshold: z.number().int().min(0).optional(),
  delta: z.number().int().optional(),
});

export const cartItemAddSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export const cartItemUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

export const shippingAddressSchema = z.object({
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(60),
});

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(['simulated_card', 'simulated_paypal', 'simulated_wallet']).default('simulated_card'),
  cardNumber: z.string().regex(/^\d{12,19}$/).optional(),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
  trackingStatus: z.string().min(2).max(40).optional(),
  trackingNumber: z.string().min(2).max(40).optional(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
