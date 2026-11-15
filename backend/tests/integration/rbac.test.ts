import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createCategoryFixture, uniqueEmail } from './helpers.js';

describe('role-based authorization', () => {
  it('customers cannot create products', async () => {
    const customer = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('rbac-customer'),
      password: 'Password123!',
      fullName: 'RBAC Customer',
    });
    const categoryId = await createCategoryFixture();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${customer.body.token}`)
      .send({
        name: 'Unauthorized Product',
        description: 'Should not be allowed',
        categoryId,
        priceCents: 1000,
        imageUrl: 'https://placehold.co/400x400',
        stock: 5,
      });

    expect(res.status).toBe(403);
  });

  it('sellers cannot access the admin dashboard', async () => {
    const seller = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('rbac-seller'),
      password: 'Password123!',
      fullName: 'RBAC Seller',
      role: 'seller',
    });

    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${seller.body.token}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated requests to the cart are rejected', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  it('a seller cannot edit another seller\'s product', async () => {
    const categoryId = await createCategoryFixture();
    const sellerA = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('seller-a'),
      password: 'Password123!',
      fullName: 'Seller A',
      role: 'seller',
    });
    const sellerB = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('seller-b'),
      password: 'Password123!',
      fullName: 'Seller B',
      role: 'seller',
    });

    const product = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerA.body.token}`)
      .send({
        name: 'Seller A Product',
        description: 'Owned by seller A',
        categoryId,
        priceCents: 1500,
        imageUrl: 'https://placehold.co/400x400',
        stock: 5,
      });

    const res = await request(app)
      .put(`/api/products/${product.body.product.id}`)
      .set('Authorization', `Bearer ${sellerB.body.token}`)
      .send({ priceCents: 1 });

    expect(res.status).toBe(403);
  });
});
