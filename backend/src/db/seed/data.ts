export interface CategorySeed {
  name: string;
  slug: string;
  description: string;
  icon: string;
}

export const categories: CategorySeed[] = [
  { name: 'Electronics', slug: 'electronics', description: 'Phones, laptops, audio and smart devices', icon: 'cpu' },
  { name: 'Clothing', slug: 'clothing', description: 'Apparel and footwear for everyone', icon: 'shirt' },
  { name: 'Furniture', slug: 'furniture', description: 'Furniture for every room', icon: 'armchair' },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, haircare and cosmetics', icon: 'sparkles' },
  { name: 'Sports', slug: 'sports', description: 'Fitness, outdoor and team sports gear', icon: 'dumbbell' },
  { name: 'Home Appliances', slug: 'home-appliances', description: 'Kitchen and home appliances', icon: 'plug' },
];

export interface SellerSeed {
  email: string;
  fullName: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string;
}

export const sellers: SellerSeed[] = [
  {
    email: 'seller.northwind@nexamarket.test',
    fullName: 'Dana Whitfield',
    storeName: 'Northwind Electronics Co.',
    storeSlug: 'northwind-electronics',
    storeDescription: 'Trusted electronics and gadgets retailer since 2015.',
  },
  {
    email: 'seller.cascade@nexamarket.test',
    fullName: 'Marcus Lee',
    storeName: 'Cascade Home & Living',
    storeSlug: 'cascade-home-living',
    storeDescription: 'Furniture and home appliances for modern living.',
  },
  {
    email: 'seller.aurora@nexamarket.test',
    fullName: 'Priya Natarajan',
    storeName: 'Aurora Style & Wellness',
    storeSlug: 'aurora-style-wellness',
    storeDescription: 'Clothing, beauty and sports essentials curated for you.',
  },
];

export interface CustomerSeed {
  email: string;
  fullName: string;
}

export const customers: CustomerSeed[] = [
  { email: 'alex.johnson@nexamarket.test', fullName: 'Alex Johnson' },
  { email: 'maria.garcia@nexamarket.test', fullName: 'Maria Garcia' },
  { email: 'sam.okafor@nexamarket.test', fullName: 'Sam Okafor' },
  { email: 'julia.novak@nexamarket.test', fullName: 'Julia Novak' },
  { email: 'ravi.patel@nexamarket.test', fullName: 'Ravi Patel' },
];

export const adminUser = { email: 'admin@nexamarket.test', fullName: 'NexaMarket Admin' };

export interface ProductSeed {
  name: string;
  slug: string;
  categorySlug: string;
  sellerIndex: number;
  priceCents: number;
  brand: string;
  description: string;
  colorHex: string;
  stock: number;
}

function img(colorHex: string, label: string): string {
  const text = encodeURIComponent(label);
  return `https://placehold.co/640x480/${colorHex}/ffffff?text=${text}`;
}

const rawProducts: Omit<ProductSeed, 'slug'>[] = [
  // Electronics (seller 0)
  { name: 'NexaPulse Wireless Earbuds Pro', categorySlug: 'electronics', sellerIndex: 0, priceCents: 7999, brand: 'NexaPulse', description: 'Active noise-cancelling wireless earbuds with 30-hour battery life and IPX5 water resistance.', colorHex: '1f2937', stock: 150 },
  { name: 'NovaView 4K Smart TV 55"', categorySlug: 'electronics', sellerIndex: 0, priceCents: 44999, brand: 'NovaView', description: '55-inch 4K UHD smart TV with HDR10+, built-in streaming apps and voice remote.', colorHex: '111827', stock: 40 },
  { name: 'AeroBook 14" Ultraslim Laptop', categorySlug: 'electronics', sellerIndex: 0, priceCents: 89999, brand: 'AeroBook', description: '14-inch ultraslim laptop, 16GB RAM, 512GB SSD, all-day battery for work and travel.', colorHex: '374151', stock: 25 },
  { name: 'PixelSnap Mirrorless Camera', categorySlug: 'electronics', sellerIndex: 0, priceCents: 129999, brand: 'PixelSnap', description: '24MP mirrorless camera with interchangeable lens mount and 4K video recording.', colorHex: '1e293b', stock: 15 },
  { name: 'SoundDome Bluetooth Speaker', categorySlug: 'electronics', sellerIndex: 0, priceCents: 5999, brand: 'SoundDome', description: 'Portable 360-degree Bluetooth speaker with 12-hour playtime and splash resistance.', colorHex: '0f172a', stock: 200 },
  { name: 'FlexCharge 20000mAh Power Bank', categorySlug: 'electronics', sellerIndex: 0, priceCents: 3499, brand: 'FlexCharge', description: 'High-capacity 20000mAh power bank with dual USB-C fast charging ports.', colorHex: '1f2937', stock: 300 },
  { name: 'OrbitWatch Series 5 Smartwatch', categorySlug: 'electronics', sellerIndex: 0, priceCents: 24999, brand: 'OrbitWatch', description: 'Fitness smartwatch with heart-rate monitoring, GPS and 7-day battery life.', colorHex: '111827', stock: 80 },
  // Clothing (seller 2)
  { name: "UrbanStride Men's Running Jacket", categorySlug: 'clothing', sellerIndex: 2, priceCents: 6499, brand: 'UrbanStride', description: 'Lightweight water-resistant running jacket with reflective trim.', colorHex: 'b91c1c', stock: 120 },
  { name: "LunaKnit Women's Wool Sweater", categorySlug: 'clothing', sellerIndex: 2, priceCents: 5499, brand: 'LunaKnit', description: 'Soft merino wool-blend sweater with ribbed cuffs and crew neckline.', colorHex: '7c2d12', stock: 90 },
  { name: 'DriftDenim Slim Fit Jeans', categorySlug: 'clothing', sellerIndex: 2, priceCents: 4999, brand: 'DriftDenim', description: 'Stretch slim-fit denim jeans with reinforced stitching.', colorHex: '1e3a8a', stock: 140 },
  { name: 'CloudStep Unisex Sneakers', categorySlug: 'clothing', sellerIndex: 2, priceCents: 7299, brand: 'CloudStep', description: 'Lightweight everyday sneakers with cushioned sole and breathable mesh.', colorHex: '334155', stock: 160 },
  { name: 'HarborLine Cotton Oxford Shirt', categorySlug: 'clothing', sellerIndex: 2, priceCents: 4299, brand: 'HarborLine', description: 'Classic-fit 100% cotton oxford button-down shirt.', colorHex: '0c4a6e', stock: 110 },
  { name: 'VeloCore Performance Leggings', categorySlug: 'clothing', sellerIndex: 2, priceCents: 3899, brand: 'VeloCore', description: 'Four-way stretch performance leggings with hidden waistband pocket.', colorHex: '581c87', stock: 130 },
  { name: 'SummitShell Packable Rain Coat', categorySlug: 'clothing', sellerIndex: 2, priceCents: 8499, brand: 'SummitShell', description: 'Packable waterproof rain shell with taped seams and adjustable hood.', colorHex: '164e63', stock: 70 },
  // Furniture (seller 1)
  { name: 'Haven Mid-Century Accent Chair', categorySlug: 'furniture', sellerIndex: 1, priceCents: 24999, brand: 'Haven', description: 'Mid-century modern accent chair with walnut legs and premium upholstery.', colorHex: '713f12', stock: 30 },
  { name: 'Oakridge Solid Wood Dining Table', categorySlug: 'furniture', sellerIndex: 1, priceCents: 54999, brand: 'Oakridge', description: 'Solid oak dining table seating up to six, hand-finished.', colorHex: '78350f', stock: 12 },
  { name: 'DriftWood Bookshelf 5-Tier', categorySlug: 'furniture', sellerIndex: 1, priceCents: 15999, brand: 'DriftWood', description: 'Five-tier bookshelf with industrial metal frame and wood shelving.', colorHex: '44403c', stock: 45 },
  { name: 'LumeDesk Adjustable Standing Desk', categorySlug: 'furniture', sellerIndex: 1, priceCents: 34999, brand: 'LumeDesk', description: 'Electric height-adjustable standing desk with memory presets.', colorHex: '1c1917', stock: 35 },
  { name: 'CloudNine Memory Foam Mattress Queen', categorySlug: 'furniture', sellerIndex: 1, priceCents: 59999, brand: 'CloudNine', description: 'Queen-size 12-inch memory foam mattress with cooling gel layer.', colorHex: '312e81', stock: 20 },
  { name: 'Meridian L-Shaped Sofa', categorySlug: 'furniture', sellerIndex: 1, priceCents: 99999, brand: 'Meridian', description: 'L-shaped sectional sofa with reversible chaise and durable weave fabric.', colorHex: '3f3f46', stock: 10 },
  { name: 'NestFrame Platform Bed Frame King', categorySlug: 'furniture', sellerIndex: 1, priceCents: 42999, brand: 'NestFrame', description: 'King-size platform bed frame with upholstered headboard, no box spring needed.', colorHex: '27272a', stock: 18 },
  // Beauty (seller 2)
  { name: 'GlowLuma Vitamin C Serum', categorySlug: 'beauty', sellerIndex: 2, priceCents: 2899, brand: 'GlowLuma', description: '20% vitamin C brightening serum with hyaluronic acid.', colorHex: 'ea580c', stock: 220 },
  { name: 'SilkVeil Hydrating Face Cream', categorySlug: 'beauty', sellerIndex: 2, priceCents: 3299, brand: 'SilkVeil', description: 'Rich hydrating face cream with ceramides for 24-hour moisture.', colorHex: 'fb7185', stock: 180 },
  { name: 'PureBristle Sonic Facial Brush', categorySlug: 'beauty', sellerIndex: 2, priceCents: 4499, brand: 'PureBristle', description: 'Rechargeable sonic facial cleansing brush with 3 intensity modes.', colorHex: 'a21caf', stock: 95 },
  { name: 'AuraMatte Liquid Lipstick Set', categorySlug: 'beauty', sellerIndex: 2, priceCents: 2499, brand: 'AuraMatte', description: 'Set of 4 long-wear matte liquid lipsticks in versatile shades.', colorHex: 'be123c', stock: 160 },
  { name: 'VelvetSkin SPF50 Sunscreen', categorySlug: 'beauty', sellerIndex: 2, priceCents: 1899, brand: 'VelvetSkin', description: 'Lightweight broad-spectrum SPF50 sunscreen, non-greasy finish.', colorHex: 'd97706', stock: 260 },
  { name: 'HaloShine Argan Oil Hair Mask', categorySlug: 'beauty', sellerIndex: 2, priceCents: 2199, brand: 'HaloShine', description: 'Deep conditioning argan oil hair mask for dry and damaged hair.', colorHex: '92400e', stock: 140 },
  { name: 'CalmRoot Lavender Bath Soak', categorySlug: 'beauty', sellerIndex: 2, priceCents: 1699, brand: 'CalmRoot', description: 'Relaxing lavender and epsom salt bath soak, 500g.', colorHex: '6d28d9', stock: 190 },
  // Sports (seller 2)
  { name: 'ProGrip Adjustable Dumbbell Set', categorySlug: 'sports', sellerIndex: 2, priceCents: 14999, brand: 'ProGrip', description: 'Adjustable dumbbell pair, 5-50 lbs each, space-saving design.', colorHex: '18181b', stock: 40 },
  { name: 'TrailBlaze Hiking Backpack 40L', categorySlug: 'sports', sellerIndex: 2, priceCents: 8999, brand: 'TrailBlaze', description: '40L hiking backpack with hydration sleeve and rain cover.', colorHex: '166534', stock: 85 },
  { name: 'SwiftCycle Road Bike Helmet', categorySlug: 'sports', sellerIndex: 2, priceCents: 5999, brand: 'SwiftCycle', description: 'Aerodynamic road bike helmet with 18 ventilation channels.', colorHex: '1d4ed8', stock: 110 },
  { name: 'CourtAce Pro Tennis Racket', categorySlug: 'sports', sellerIndex: 2, priceCents: 11999, brand: 'CourtAce', description: 'Lightweight graphite tennis racket for intermediate to advanced players.', colorHex: '15803d', stock: 65 },
  { name: 'FlexFit Yoga Mat Premium', categorySlug: 'sports', sellerIndex: 2, priceCents: 3999, brand: 'FlexFit', description: 'Extra-thick non-slip yoga mat with carrying strap.', colorHex: '0d9488', stock: 200 },
  { name: 'HydroFlow Insulated Water Bottle 32oz', categorySlug: 'sports', sellerIndex: 2, priceCents: 2799, brand: 'HydroFlow', description: 'Double-wall insulated steel water bottle, keeps drinks cold 24 hours.', colorHex: '0369a1', stock: 240 },
  { name: 'GoalStrike Match Soccer Ball', categorySlug: 'sports', sellerIndex: 2, priceCents: 2999, brand: 'GoalStrike', description: 'FIFA-quality size 5 match soccer ball with textured panels.', colorHex: '047857', stock: 150 },
  // Home Appliances (seller 1)
  { name: 'BrewMaster Drip Coffee Maker 12-Cup', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 5499, brand: 'BrewMaster', description: '12-cup programmable drip coffee maker with reusable filter.', colorHex: '3f3f46', stock: 95 },
  { name: 'FrostPeak Countertop Ice Maker', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 13999, brand: 'FrostPeak', description: 'Countertop ice maker producing 26 lbs of ice per day.', colorHex: '1e3a8a', stock: 50 },
  { name: 'CycloneAir Robot Vacuum Cleaner', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 24999, brand: 'CycloneAir', description: 'Smart robot vacuum with app control, mapping and auto-recharge.', colorHex: '27272a', stock: 60 },
  { name: 'ChillBreeze Tower Fan', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 7999, brand: 'ChillBreeze', description: 'Quiet oscillating tower fan with remote and 3 wind modes.', colorHex: '0e7490', stock: 100 },
  { name: 'CrispAir Digital Air Fryer 6Qt', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 8999, brand: 'CrispAir', description: '6-quart digital air fryer with 8 preset cooking programs.', colorHex: 'b45309', stock: 130 },
  { name: 'PureMist Cool Mist Humidifier', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 4499, brand: 'PureMist', description: 'Ultrasonic cool mist humidifier with auto shutoff, 4L tank.', colorHex: '0284c7', stock: 150 },
  { name: 'SteamGlide Ceramic Iron', categorySlug: 'home-appliances', sellerIndex: 1, priceCents: 3299, brand: 'SteamGlide', description: 'Ceramic-soleplate steam iron with anti-drip and auto shutoff.', colorHex: '52525b', stock: 170 },
];

export const products: ProductSeed[] = rawProducts.map((p) => ({
  ...p,
  slug: p.name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, ''),
}));

export function imageUrlFor(product: ProductSeed): string {
  return img(product.colorHex, product.brand);
}
