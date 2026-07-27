import { aiConfigured, aiProvider, customAnalysis, extractTravelRequest, rankCandidates, scheduleItinerary, transportAdvice } from './ai/service.js';
import { amapConfigured, forwardGeocode, planRoute, realtimeTransitQuery, reverseGeocode, searchPois, trafficStatus, transitPlan } from './amap/service.js';
import { recommendPlaces } from './guide/recommend.js';
import { corsHeaders, errorResponse, isAllowedOrigin, json, readJson } from './http.js';

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) return new Response(null, { status: 204, headers: cors });
    if (url.pathname.startsWith('/api/')) {
      if (!isAllowedOrigin(request, env)) return json({ error: 'Origin not allowed' }, 403, cors);
      try { return await handleApi(request, env, url, cors); }
      catch (error) { return errorResponse(error, cors); }
    }
    return serveAsset(request, env, url);
  },
};

async function handleApi(request, env, url, cors) {
  const key = `${request.method.toUpperCase()} ${url.pathname}`;
  if (key === 'GET /api/health') return json({ ok: true, generatedAt: new Date().toISOString(), capabilities: { ai: aiConfigured(env), aiProvider: aiProvider(env), amap: amapConfigured(env), vehicleRealtime: false }, vehicleRealtimeMessage: '车辆 GPS/列车位置需要当地运营方授权数据源。' }, 200, noStore(cors));
  if (key === 'GET /api/showcase/wuhan') return json(wuhanShowcaseConfig(env), 200, noStore(cors));

  if (key === 'POST /api/ai/parse-request') {
    const body = await readJson(request); const data = await extractTravelRequest(body.text, env);
    return json({ data, provider: aiProvider(env), generatedAt: new Date().toISOString() }, 200, noStore(cors));
  }
  if (key === 'POST /api/ai/recommend') {
    const body = await readJson(request, 256_000); const data = await rankCandidates(body, env);
    return json({ data, provider: aiProvider(env), generatedAt: new Date().toISOString() }, 200, noStore(cors));
  }
  if (key === 'POST /api/ai/analyze') {
    const body = await readJson(request, 256_000); const data = await customAnalysis(body, env);
    return json({ data, provider: aiProvider(env), generatedAt: new Date().toISOString() }, 200, noStore(cors));
  }
  if (key === 'POST /api/ai/schedule') {
    const body = await readJson(request, 128_000); const data = await scheduleItinerary(body, env);
    return json({ data, provider: aiProvider(env), generatedAt: new Date().toISOString() }, 200, noStore(cors));
  }
  if (key === 'POST /api/ai/transport-advice') {
    const body = await readJson(request, 128_000); const data = await transportAdvice(body, env);
    return json({ data, provider: aiProvider(env), generatedAt: new Date().toISOString() }, 200, noStore(cors));
  }

  if (key === 'GET /api/poi/search') return json(await searchPois(env, url.searchParams, 'poi'), 200, shortCache(cors));
  if (key === 'GET /api/restaurants/search') return json(await searchPois(env, url.searchParams, 'restaurant'), 200, shortCache(cors));
  if (key === 'GET /api/shops/search') return json(await searchPois(env, url.searchParams, 'shop'), 200, shortCache(cors));
  if (key === 'GET /api/hotels/search') return json(await searchPois(env, url.searchParams, 'hotel'), 200, shortCache(cors));
  if (key === 'GET /api/attractions/search') return json(await searchPois(env, url.searchParams, 'attraction'), 200, shortCache(cors));
  if (key === 'GET /api/location/reverse') return json(await reverseGeocode(env, url.searchParams), 200, shortCache(cors));
  if (key === 'GET /api/location/geocode') return json(await forwardGeocode(env, url.searchParams), 200, shortCache(cors));
  if (key === 'POST /api/restaurants/guide') return json(await recommendPlaces(env, await readJson(request, 256_000), 'restaurant'), 200, noStore(cors));
  if (key === 'POST /api/shops/guide') return json(await recommendPlaces(env, await readJson(request, 256_000), 'shop'), 200, noStore(cors));
  if (key === 'POST /api/guide/recommend') return json(await recommendPlaces(env, await readJson(request, 256_000)), 200, noStore(cors));

  if (key === 'POST /api/route/plan') return json(await planRoute(env, await readJson(request, 128_000)), 200, shortCache(cors));
  if (key === 'GET /api/traffic/status') return json(await trafficStatus(env, url.searchParams), 200, trafficCache(cors));
  if (key === 'GET /api/transit/realtime') return json(await realtimeTransitQuery(env, url.searchParams), 200, trafficCache(cors));
  if (key === 'POST /api/transit/plan') return json(await transitPlan(env, await readJson(request, 128_000)), 200, trafficCache(cors));

  return json({ error: 'API endpoint not found' }, 404, cors);
}

async function serveAsset(request, env, url) {
  if (!env.ASSETS?.fetch) return json({ error: 'Static asset binding is unavailable' }, 503);
  let response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return response;
  response = await env.ASSETS.fetch(new Request(new URL(`/client${url.pathname}`, url), request));
  if (response.status !== 404) return response;
  if (!url.pathname.includes('.')) {
    response = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    if (response.status !== 404) return response;
    return env.ASSETS.fetch(new Request(new URL('/client/index.html', url), request));
  }
  return response;
}

function noStore(headers) { return { ...headers, 'Cache-Control': 'no-store' }; }
function shortCache(headers) { return { ...headers, 'Cache-Control': 'private, max-age=120' }; }
function trafficCache(headers) { return { ...headers, 'Cache-Control': 'private, max-age=45' }; }

const WUHAN_SHOWCASE_IMAGE_IDS = [
  'river-bridge-night', 'river-skyline', 'lakes-skyline',
];

function wuhanShowcaseConfig(env) {
  const configured = String(env.WUHAN_HERO_IMAGE || '').trim();
  const imageId = WUHAN_SHOWCASE_IMAGE_IDS.includes(configured)
    ? configured
    : WUHAN_SHOWCASE_IMAGE_IDS[Math.floor(Math.random() * WUHAN_SHOWCASE_IMAGE_IDS.length)];
  return {
    imageId,
    selection: WUHAN_SHOWCASE_IMAGE_IDS.includes(configured) ? 'configured' : 'random',
    availableImageIds: WUHAN_SHOWCASE_IMAGE_IDS,
  };
}

export { parsePolyline, parseTransitLegs } from './amap/service.js';
