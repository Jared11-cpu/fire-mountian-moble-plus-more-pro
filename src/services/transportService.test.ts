import { describe, expect, it, vi } from 'vitest';
import { defaultTripRequest, generateTripPlan } from '../domain/trip';
import { resolveDrivingTransportPlan, resolveTransportComparison, resolveTransportPlan, toTransportPlanRequest, type TransportPlanResponse } from './transportService';

function requestFixture() {
  const request = defaultTripRequest('宜昌');
  const plan = generateTripPlan(request);
  return toTransportPlanRequest(request, plan.route.points, plan.settings.departureTime);
}

describe('transportService', () => {
  it('未配置 API 时生成分段规则交通方案', async () => {
    const result = await resolveTransportPlan(requestFixture(), { endpoint: '' });
    expect(result.source).toBe('rules-v1');
    expect(result.isRealtime).toBe(false);
    expect(result.segments).toHaveLength(4);
    expect(result.segments.every((segment) => segment.arrivalTime > segment.departureTime)).toBe(true);
    expect(result.notices[0]).toContain('未取得可用的高德公交结果');
    expect(result.segments.every((segment) => segment.legs.length === 1)).toBe(true);
    expect(result.segments.every((segment) => segment.legs.every((leg) => leg.polyline.length === 0))).toBe(true);
    expect(result.segments.every((segment) => segment.mode !== '景区专线')).toBe(true);
    expect(result.segments.filter((segment) => segment.mode !== '步行').every((segment) => segment.costEstimate === '待查询')).toBe(true);
  });

  it('配置后端地址时使用交通 API 响应', async () => {
    const apiResult: TransportPlanResponse = { source: 'transport-api', sourceLabel: '测试交通 API', generatedAt: new Date().toISOString(), isRealtime: true, freshness: 'vehicle-realtime', totalMinutes: 20, totalDistanceKm: 8, totalFare: 4, summary: '实时路线可用', segments: [{ id: 'a-b', from: 'A', to: 'B', departureTime: '09:00', arrivalTime: '09:20', durationMinutes: 20, distanceKm: 8, mode: '地铁', costEstimate: '¥4', fare: 4, instruction: '乘坐地铁2号线', liveStatus: '道路畅通', legs: [{ id: 'leg-1', mode: 'subway', lineName: '地铁2号线', viaStops: ['中山公园'], durationMinutes: 20, distanceKm: 8, fare: 4, polyline: [[114.1, 30.1], [114.2, 30.2]] }] }], notices: [] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(apiResult), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
    const result = await resolveTransportPlan(requestFixture(), { endpoint: 'https://example.test/transport', fetcher });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.source).toBe('transport-api');
    expect(result.isRealtime).toBe(true);
    expect(result.segments[0].liveStatus).toBe('道路畅通');
  });

  it('uses the browser global as this when calling the native fetch function', async () => {
    const apiResult: TransportPlanResponse = { source: 'transport-api', sourceLabel: '高德动态公交规划', generatedAt: new Date().toISOString(), isRealtime: false, freshness: 'live-query', totalMinutes: 20, totalDistanceKm: 8, summary: '动态路线可用', segments: [], notices: [] };
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify(apiResult), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }) as unknown as typeof fetch;

    const result = await resolveTransportPlan(requestFixture(), { endpoint: 'https://example.test/transport', fetcher });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.sourceLabel).toBe('高德动态公交规划');
    expect(result.freshness).toBe('live-query');
  });

  it('交通 API 失败时明确降级为规则方案', async () => {
    const fetcher = vi.fn(async () => new Response('error', { status: 503 })) as unknown as typeof fetch;
    const result = await resolveTransportPlan(requestFixture(), { endpoint: 'https://example.test/transport', fetcher });
    expect(result.source).toBe('rules-fallback');
    expect(result.sourceLabel).toContain('规则降级');
    expect(result.notices[0]).toContain('HTTP 503');
  });

  it('按每段路线组合高德驾车方案', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ paths: [{ durationMinutes: 18, distanceKm: 9.4, tolls: 0, taxiCost: 28, polyline: [[111.1, 30.1], [111.2, 30.2]], steps: [{ instruction: '沿东山大道向西行驶', road: '东山大道' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
    const result = await resolveDrivingTransportPlan(requestFixture(), { endpoint: 'https://example.test/route', fetcher });
    expect(result.sourceLabel).toBe('高德动态驾车规划');
    expect(result.segments).toHaveLength(4);
    expect(result.segments.every((segment) => segment.mode === '驾车')).toBe(true);
    expect(result.segments[0].instruction).toContain('沿东山大道');
    expect(result.segments[0].costEstimate).toBe('打车约 ¥28 · 无过路费');
    expect(result.segments[0].legs[0].roadNames).toEqual(['东山大道']);
  });

  it('对比高德公交和驾车事实并采用千问推荐', async () => {
    const transit: TransportPlanResponse = { source: 'transport-api', sourceLabel: '高德动态公交规划', generatedAt: new Date().toISOString(), isRealtime: false, freshness: 'live-query', totalMinutes: 80, totalDistanceKm: 30, totalFare: 8, summary: '公交可用', segments: [], notices: [] };
    const fetcherMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/transit')) return new Response(JSON.stringify(transit), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/route')) return new Response(JSON.stringify({ paths: [{ durationMinutes: 20, distanceKm: 12, tolls: 0, polyline: [] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ recommendedOptionId: 'driving', reason: '驾车用时更短。', cautions: ['出发前刷新路况。'] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const fetcher = fetcherMock as unknown as typeof fetch;
    const request = requestFixture();
    request.strategy = 'least-walking';
    const result = await resolveTransportComparison(request, { transitEndpoint: 'https://example.test/transit', routeEndpoint: 'https://example.test/route', adviceEndpoint: 'https://example.test/advice', fetcher });
    expect(result.options.map((option) => option.id)).toEqual(['transit', 'driving']);
    expect(result.recommendedOptionId).toBe('driving');
    expect(result.analysisSource).toBe('qwen-amap');
    expect(result.reason).toContain('用时更短');
    expect(result.optionAnalyses).toHaveLength(2);
    expect(result.options.find((option) => option.id === 'driving')?.plan.segments.every((segment) => segment.legs.every((leg) => leg.polyline.length === 0))).toBe(true);
    const transitCall = fetcherMock.mock.calls.find(([input]) => String(input).endsWith('/transit'));
    const adviceCall = fetcherMock.mock.calls.find(([input]) => String(input).endsWith('/advice'));
    expect(JSON.parse(String((transitCall?.[1] as RequestInit).body)).strategy).toBe('least-walking');
    expect(JSON.parse(String((adviceCall?.[1] as RequestInit).body)).userPreference).toBe('少步行');
  });
});

