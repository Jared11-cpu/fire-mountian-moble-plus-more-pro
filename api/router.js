const DEFAULT_API_UPSTREAM = 'https://chuyou-ai-250.galangalheli826.chatgpt.site';

function upstreamRequest(request) {
  const incomingUrl = new URL(request.url);
  const path = incomingUrl.searchParams.get('__path') || '';
  incomingUrl.searchParams.delete('__path');

  const upstreamBase = String(process.env.API_UPSTREAM_ORIGIN || DEFAULT_API_UPSTREAM).replace(/\/$/, '');
  const upstreamUrl = new URL(`${upstreamBase}/api/${path.replace(/^\/+/, '')}`);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    duplex: 'half',
    redirect: 'manual',
  });
}

export default {
  async fetch(request) {
    const response = await fetch(upstreamRequest(request));
    const headers = new Headers(response.headers);
    headers.delete('access-control-allow-origin');
    headers.delete('access-control-allow-credentials');
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export { upstreamRequest };
