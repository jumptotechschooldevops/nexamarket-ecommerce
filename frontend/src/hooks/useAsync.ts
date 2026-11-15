import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

export interface AsyncResult<T> extends AsyncState<T> {
  setData: (next: T | ((prev: T) => T)) => void;
}

/**
 * Fetches `fetcher()` whenever `key` changes, exposing { data, loading, error }
 * plus a `setData` escape hatch for optimistic/imperative updates (e.g. after a
 * mutation) outside of the fetch cycle.
 *
 * `loading` resets to `true` synchronously in the same render where `key`
 * changes, using React's documented "adjusting state when a prop changes"
 * pattern (comparing against the previous key during render, via useState
 * rather than useRef since ref reads/writes are not allowed during render):
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 *
 * The actual fetch runs in an effect that calls no state setters synchronously
 * — every setState call happens inside a `.then`/`.catch` callback, which is
 * what keeps this compliant with `react-hooks/set-state-in-effect`: that rule
 * flags setState calls reachable synchronously (before any await/promise
 * callback boundary) within an effect's call graph, precisely because those
 * calls force an extra render before paint. Callbacks attached to a promise
 * are explicitly exempted — the rule's own guidance describes "subscribing to
 * an external system and calling setState in a callback" as the correct
 * shape, which is exactly what the `.then`/`.catch` below do.
 *
 * `fetcher` is intentionally excluded from the effect's dependency array: it
 * is expected to be a closure over everything `key` represents, so re-running
 * only when `key` changes (not on every render) is the point. Callers must
 * make sure `key` changes whenever any value `fetcher` depends on changes.
 */
export function useAsync<T>(key: string, fetcher: () => Promise<T>, initialData: T): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initialData, loading: true, error: null });
  const [lastKey, setLastKey] = useState(key);

  if (lastKey !== key) {
    setLastKey(key);
    setState({ data: initialData, loading: true, error: null });
  }

  useEffect(() => {
    let active = true;
    fetcher()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({ data: initialData, loading: false, error: err instanceof Error ? err.message : 'Request failed' });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on key change, see doc comment above
  }, [key]);

  function setData(next: T | ((prev: T) => T)): void {
    setState((prev) => ({
      ...prev,
      data: typeof next === 'function' ? (next as (prev: T) => T)(prev.data) : next,
    }));
  }

  return { ...state, setData };
}
