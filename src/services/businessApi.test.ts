import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUSINESS_PLAN_TIMEOUT_MS, requestBusinessPlan } from './businessApi';

const input = { name: '江景民宿', spots: '三峡大坝', target: '亲子家庭', city: '宜昌' };

function hangingFetch() {
  return vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('business plan client', () => {
  it('gives up with a clear message when the server never answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const pending = requestBusinessPlan(input);
    const assertion = expect(pending).rejects.toThrow(`${BUSINESS_PLAN_TIMEOUT_MS / 1000} 秒`);
    await vi.advanceTimersByTimeAsync(BUSINESS_PLAN_TIMEOUT_MS + 1);
    await assertion;
  });

  it('aborts the request when the caller cancels', async () => {
    const fetcher = hangingFetch();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = requestBusinessPlan(input, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });
});
