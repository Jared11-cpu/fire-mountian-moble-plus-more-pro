import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultTripRequest, generateTripPlan } from '../domain/trip';
import { enrichTripPlanWithBackend, getDianpingSearchUrl, parseTravelRequestWithAi } from './travelApi';

afterEach(() => vi.restoreAllMocks());

describe('travel backend integration', () => {
  it('uses the Qwen request parser through the existing same-origin backend', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { city: '武汉', days: 2, budgetPerPerson: 600, interests: ['美食'], dietaryNeeds: [], people: null, startDate: null, mobility: null, transportPreference: '地铁', hotelPreference: null, departureDeadline: null } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const result = await parseTravelRequestWithAi('武汉两天，预算600，喜欢美食');
    expect(result).toMatchObject({ city: '武汉', days: 2, budgetPerPerson: 600 });
    expect(fetcher.mock.calls[0][0]).toBe('/api/ai/parse-request');
  });

  it('forces an explicitly requested AMap place into the personalized route', async () => {
    const request = { ...defaultTripRequest('武汉'), freeText: '武汉两天，必须去武汉长江大桥，喜欢历史和江景', requestedPlaces: ['武汉长江大桥'], interests: ['历史文化'] as const };
    const plan = generateTripPlan(request as never, null);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/attractions/search')) return new Response(JSON.stringify({ items: [{ id: 'bridge', name: '武汉长江大桥', district: '武昌区', address: '长江之上', location: { lng: 114.288, lat: 30.55 }, photos: ['http://aos-comment.amap.com/wuhan-bridge.jpg'] }, { id: 'museum', name: '湖北省博物馆', district: '武昌区', location: { lng: 114.367, lat: 30.56 }, photos: ['https://aos-comment.amap.com/hubei-museum.jpg'] }, { id: 'square', name: '法治文化广场', district: '武昌区', location: { lng: 114.31, lat: 30.57 }, photos: [] }] }), { status: 200 });
      if (url.endsWith('/api/ai/recommend')) return new Response(JSON.stringify({ data: { status: 'ok', ranked: [{ id: 'museum', reason: '符合历史偏好', fitScore: 90 }, { id: 'bridge', reason: '用户明确要求', fitScore: 100 }], warnings: [] } }), { status: 200 });
      if (url.endsWith('/api/restaurants/guide')) return new Response(JSON.stringify({ generatedAt: '2026-07-18T10:00:00.000Z', recommendations: [{ id: 'poi-1', name: '蔡林记吉庆街店', verifiedShopName: '蔡林记（吉庆街店）', district: '江汉区', address: '吉庆街', averageCost: 28, category: '热干面', recommendationReason: '早餐顺路且预算匹配', nearestRoutePoint: { name: '武汉长江大桥' }, routeDistanceMeters: 860, location: { lng: 114.3, lat: 30.5 } }] }), { status: 200 });
      if (url.endsWith('/api/ai/analyze')) return new Response(JSON.stringify({ data: { analysis: '路线包含用户指定的武汉长江大桥，并补充历史文化地点。' } }), { status: 200 });
      if (url.endsWith('/api/ai/schedule')) return new Response(JSON.stringify({ data: { departureTime: '07:45', items: [{ id: plan.route.startPoint.id, day: 1, arrivalTime: '08:00', reason: '安全抵达起点' }, { id: 'amap-bridge', day: 1, arrivalTime: '10:30', reason: '上午游览' }, { id: 'amap-museum', day: 1, arrivalTime: '14:00', reason: '下午参观' }], safetyNotes: ['避免夜间赶路'] } }), { status: 200 });
      return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await enrichTripPlanWithBackend(plan, request as never);
    expect(result.analysis).toContain('武汉长江大桥');
    expect(result.schedule).toMatchObject({ departureTime: '07:45', safetyNotes: ['避免夜间赶路'] });
    expect(result.routePoints?.[0]).toMatchObject({ name: '武汉长江大桥', lat: 30.55, lng: 114.288, imageUrl: 'https://aos-comment.amap.com/wuhan-bridge.jpg', imageCredit: { author: '高德地图地点相册' } });
    expect(result.routePoints?.[0].reason).toContain('首页明确提出的必经地点');
    expect(result.foods?.[0]).toMatchObject({ id: 'poi-1', name: '蔡林记吉庆街店', priceRange: '约 ¥28/人', dianpingUrl: 'https://www.dianping.com/shop/l3LoOn1gi2ggY01E', dianpingLinkType: 'direct', nearestPointName: '武汉长江大桥', distanceMeters: 860, analysisSource: 'qwen-amap' });
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([expect.stringContaining('/api/attractions/search'), '/api/ai/recommend', '/api/restaurants/guide', '/api/ai/analyze', '/api/ai/schedule']));
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toContain('/api/attractions/search?city=%E6%AD%A6%E6%B1%89&keywords=%E6%AD%A6%E6%B1%89%E9%95%BF%E6%B1%9F%E5%A4%A7%E6%A1%A5&pageSize=10&allTypes=1');
    const restaurantCall = fetcher.mock.calls.find((call) => String(call[0]).endsWith('/api/restaurants/guide')) as unknown as [RequestInfo | URL, RequestInit] | undefined;
    const restaurantBody = JSON.parse(String(restaurantCall?.[1]?.body));
    expect(restaurantBody.routePoints.length).toBeGreaterThan(1);
    expect(restaurantBody).toMatchObject({ keywords: '餐厅', limit: 12, radiusMeters: 1500 });
    expect(restaurantBody.verifiedShops).toBeUndefined();
    const recommendCall = fetcher.mock.calls.find((call) => String(call[0]).endsWith('/api/ai/recommend')) as unknown as [RequestInfo | URL, RequestInit] | undefined;
    const recommendBody = JSON.parse(String(recommendCall?.[1]?.body));
    expect(recommendBody.candidates.map((item: { id: string }) => item.id)).not.toContain('square');
    const scheduleCall = fetcher.mock.calls.find((call) => String(call[0]).endsWith('/api/ai/schedule')) as unknown as [RequestInfo | URL, RequestInit] | undefined;
    const scheduleBody = JSON.parse(String(scheduleCall?.[1]?.body));
    expect(scheduleBody).toMatchObject({ city: '武汉', days: 2, travelerType: request.travelerType });
    expect(scheduleBody.points.every((point: { travelMinutesToNext: number }) => Number.isFinite(point.travelMinutesToNext))).toBe(true);
  });

  it('builds a city-scoped Dianping search link for a live AMap restaurant without a verified direct page', () => {
    expect(getDianpingSearchUrl('武汉', '湖边小馆')).toBe('https://www.dianping.com/search/keyword/16/0_%E6%B9%96%E8%BE%B9%E5%B0%8F%E9%A6%86');
    expect(getDianpingSearchUrl('长沙', '湘菜馆')).toContain('/search/keyword/0/0_');
  });
});
