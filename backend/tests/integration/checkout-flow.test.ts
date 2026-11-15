import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createCategoryFixture, uniqueEmail } from './helpers.js';

describe('end-to-end marketplace flow: register seller -> list product -> customer checkout -> tracking', () => {
  let sellerToken: string;
  let customerToken: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    categoryId = await createCategoryFixture();

    const sellerRes = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('seller'),
      password: 'SellerPass123!',
      fullName: 'Flow Seller',
      role: 'seller',
      storeName: 'Flow Test Store',
    });
    sellerToken = sellerRes.body.token;

    const customerRes = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('buyer'),
      password: 'BuyerPass123!',
      fullName: 'Flow Buyer',
    });
    customerToken = customerRes.body.token;
  });

  it('seller creates a product with initial stock', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Integration Test Widget',
        description: 'A widget created during integration testing.',
        categoryId,
        priceCents: 2500,
        imageUrl: 'https://placehold.co/400x400?text=Widget',
        stock: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.product.stock).toBe(10);
    productId = res.body.product.id;
  });

  it('customer can find the product via search', async () => {
    const res = await request(app).get('/api/products').query({ q: 'Integration Test Widget' });
    expect(res.status).toBe(200);
    expect(res.body.products.some((p: { id: string }) => p.id === productId)).toBe(true);
  });

  it('customer adds the product to their cart', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(2);
  });

  it('rejects adding more items than available stock', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 999 });
    expect(res.status).toBe(400);
  });

  let orderId: string;

  it('customer checks out with a simulated payment', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: {
          line1: '1 Test Way',
          city: 'Testville',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        paymentMethod: 'simulated_card',
        cardNumber: '4242424242424242',
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('paid');
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.totalCents).toBeGreaterThan(0);
    orderId = res.body.order.id;
  });

  it('decrements inventory after checkout', async () => {
    const res = await request(app).get(`/api/products/${productId}`);
    expect(res.body.product.stock).toBe(8);
  });

  it('customer sees the order in their order history', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orders.some((o: { id: string }) => o.id === orderId)).toBe(true);
  });

  it('customer can view order tracking timeline', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/tracking`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tracking.timeline.length).toBeGreaterThan(0);
  });

  it('a different customer cannot view this order', async () => {
    const otherRes = await request(app).post('/api/auth/register').send({
      email: uniqueEmail('other'),
      password: 'OtherPass123!',
      fullName: 'Other Buyer',
    });
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherRes.body.token}`);
    expect(res.status).toBe(403);
  });

  it('seller can update order tracking status', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ trackingStatus: 'shipped', status: 'shipped' });
    expect(res.status).toBe(200);
    expect(res.body.order.trackingStatus).toBe('shipped');
  });
});
