import type { PaginationMeta } from '../types';

export function Pagination({ meta, onPageChange }: { meta: PaginationMeta; onPageChange: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;

  const pages = Array.from({ length: meta.totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1,
  );

  return (
    <div className="pagination">
      <button disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
        Prev
      </button>
      {pages.map((p, idx) => (
        <span key={p} style={{ display: 'contents' }}>
          {idx > 0 && pages[idx - 1] !== p - 1 && <span style={{ alignSelf: 'center' }}>…</span>}
          <button className={p === meta.page ? 'active' : ''} onClick={() => onPageChange(p)}>
            {p}
          </button>
        </span>
      ))}
      <button disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
        Next
      </button>
    </div>
  );
}
