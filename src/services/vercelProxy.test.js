import { afterEach, describe, expect, it, vi } from 'vitest';
import proxy, { upstreamRequest } from '../../api/router.js';

describe('Vercel API proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_UPSTREAM_ORIGIN;
  });

  it('forwards the original API path and query without browser CORS headers', () => {
    process.env.API_UPSTREAM_ORIGIN = 'https://backend.example/';
    const request = new Request('https://preview.vercel.app/api/router?__path=route/plan&mode=driving', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://preview.vercel.app',
        referer: 'https://preview.vercel.app/',
      },
      body: JSON.stringify({ origin: '武汉站', destination: '黄鹤楼' }),
    });

    const forwarded = upstreamRequest(request);

    expect(forwarded.url).toBe('https://backend.example/api/route/plan?mode=driving');
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('origin')).toBeNull();
    expect(forwarded.headers.get('referer')).toBeNull();
  });

  it('returns the upstream response while removing cross-origin response headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': 'https://backend.example',
      },
    })));

    const response = await proxy.fetch(new Request('https://preview.vercel.app/api/router?__path=health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
