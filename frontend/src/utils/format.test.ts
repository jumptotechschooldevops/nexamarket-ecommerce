import { describe, expect, it } from 'vitest';
import { formatMoney, formatDate, titleCase } from './format';

describe('formatMoney', () => {
  it('formats cents as USD currency', () => {
    expect(formatMoney(1999)).toBe('$19.99');
  });

  it('formats zero correctly', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });
});

describe('formatDate', () => {
  it('formats an ISO date into a readable short date', () => {
    expect(formatDate('2026-01-15T00:00:00.000Z')).toMatch(/Jan 1[45], 2026/);
  });
});

describe('titleCase', () => {
  it('converts snake_case to Title Case', () => {
    expect(titleCase('order_placed')).toBe('Order Placed');
  });

  it('handles single words', () => {
    expect(titleCase('shipped')).toBe('Shipped');
  });
});
