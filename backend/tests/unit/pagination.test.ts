import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, normalizePagination } from '../../src/utils/pagination.js';

describe('normalizePagination', () => {
  it('defaults to page 1 and limit 20', () => {
    expect(normalizePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('computes the correct offset for a given page and limit', () => {
    expect(normalizePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('clamps limit to a maximum of 100', () => {
    expect(normalizePagination({ limit: 500 })).toEqual({ page: 1, limit: 100, offset: 0 });
  });

  it('clamps page to a minimum of 1', () => {
    expect(normalizePagination({ page: -5 })).toEqual({ page: 1, limit: 20, offset: 0 });
  });
});

describe('buildPaginationMeta', () => {
  it('computes total pages, rounding up', () => {
    expect(buildPaginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it('returns at least 1 total page when there are zero results', () => {
    expect(buildPaginationMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });
});
