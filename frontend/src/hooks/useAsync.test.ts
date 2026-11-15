import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsync } from './useAsync';

describe('useAsync', () => {
  it('starts in a loading state and resolves with the fetched data', async () => {
    const fetcher = vi.fn().mockResolvedValue('result-1');
    const { result } = renderHook(() => useAsync('key-1', fetcher, null));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('result-1');
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('resets to loading and refetches when the key changes', async () => {
    const fetcher = vi.fn().mockImplementation((k: string) => Promise.resolve(`data-for-${k}`));
    const { result, rerender } = renderHook(({ key }: { key: string }) => useAsync(key, () => fetcher(key), null), {
      initialProps: { key: 'a' },
    });

    await waitFor(() => expect(result.current.data).toBe('data-for-a'));

    rerender({ key: 'b' });
    // The hook resets to loading synchronously, in the same render as the key change.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data).toBe('data-for-b'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('surfaces a rejected fetch as an error and falls back to initialData', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useAsync('key-1', fetcher, 'fallback'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('fallback');
    expect(result.current.error).toBe('network down');
  });

  it('ignores a stale response if the key changes before the first fetch resolves', async () => {
    let resolveFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const fetcher = vi.fn().mockImplementation((k: string) => (k === 'a' ? first : Promise.resolve('data-for-b')));

    const { result, rerender } = renderHook(({ key }: { key: string }) => useAsync(key, () => fetcher(key), null), {
      initialProps: { key: 'a' },
    });

    rerender({ key: 'b' });
    await waitFor(() => expect(result.current.data).toBe('data-for-b'));

    // The first (now-stale) fetch resolves after the key has already moved on.
    await act(async () => {
      resolveFirst('data-for-a');
    });

    expect(result.current.data).toBe('data-for-b');
  });

  it('exposes setData for imperative/optimistic updates outside the fetch cycle', async () => {
    const fetcher = vi.fn().mockResolvedValue('initial');
    const { result } = renderHook(() => useAsync<string | null>('key-1', fetcher, null));

    await waitFor(() => expect(result.current.data).toBe('initial'));

    act(() => {
      result.current.setData('updated-by-caller');
    });
    expect(result.current.data).toBe('updated-by-caller');

    act(() => {
      result.current.setData((prev) => `${prev}-again`);
    });
    expect(result.current.data).toBe('updated-by-caller-again');
  });
});
