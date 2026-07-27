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

  it('retries one transient AI failure before falling back to local parsing', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporary upstream failure' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { city: '宜昌', days: 2, budgetPerPerson: 600, interests: ['拍照', '美食'], dietaryNeeds: [], people: 1, startDate: null, mobility: null, transportPreference: null, hotelPreference: null, departureDeadline: null } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const result = await parseTravelRequestWithAi('我想去宜昌两天一夜，预算600元，喜欢拍照和美食');

    expect(result).toMatchObject({ city: '宜昌', days: 2, budgetPerPerson: 600 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('forces an explicitly requested AMap place into the personalized route', async () => {
    const request = { ...defaultTripRequest('武汉'), freeText: '武汉两天，必须去武汉长江大桥，喜欢历史和江景', requestedPlaces: ['武汉长江大桥'], interests: ['历史文化'] as const };
    const plan = generateTripPlan(request as never, null);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/attractions/search')) return new Response(JSON.stringify({ items: [{ id: 'bridge', name: '武汉长江大桥', district: '武昌区', address: '长江之上', location: { lng: 114.288, lat: 30.55 }, photos: ['http://aos-comment.amap.com/wuhan-bridge.jpg'] }, { id: 'museum', name: '湖北省博物馆', district: '武昌区', location: { lng: 114.367, lat: 30.56 }, photos: ['https://aos-comment.amap.com/hubei-museum.jpg'] }, { id: 'square', name: '法治文化广场', district: '武昌区', location: { lng: 114.31, lat: 30.57 }, photos: [] }, { id: 'square-photo', name: '清廉文化广场', district: '武昌区', location: { lng: 114.32, lat: 30.58 }, photos: ['https://example.com/square.jpg'] }, { id: 'far', name: '同名远郊景点', district: '外地', location: { lng: 116.1, lat: 31.8 }, photos: ['https://example.com/far.jpg'] }] }), { status: 200 });
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
    expect(recommendBody.candidates.map((item: { id: string }) => item.id)).not.toContain('square-photo');
    expect(recommendBody.candidates.map((item: { id: string }) => item.id)).not.toContain('far');
    const scheduleCall = fetcher.mock.calls.find((call) => String(call[0]).endsWith('/api/ai/schedule')) as unknown as [RequestInfo | URL, RequestInit] | undefined;
    const scheduleBody = JSON.parse(String(scheduleCall?.[1]?.body));
    expect(scheduleBody).toMatchObject({ city: '武汉', days: 2, travelerType: request.travelerType });
    expect(scheduleBody.points.every((point: { travelMinutesToNext: number }) => Number.isFinite(point.travelMinutesToNext))).toBe(true);
  });

  it('keeps city landmark anchors while removing same-scenic-area route duplicates', async () => {
    const request = { ...defaultTripRequest('襄阳'), freeText: '襄阳两天一夜，喜欢拍照和美食', interests: ['拍照', '美食'] as const };
    const plan = generateTripPlan(request as never, null);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('/api/attractions/search')) {
        if (url.includes('keywords=古隆中')) return new Response(JSON.stringify({ items: [
          { id: 'longzhong', name: '古隆中风景区', district: '襄城区', location: { lng: 112.04, lat: 31.99 }, photos: ['https://example.com/longzhong.jpg'] },
          { id: 'wuhou', name: '古隆中武侯祠', district: '襄城区', location: { lng: 112.041, lat: 31.991 }, photos: ['https://example.com/wuhou.jpg'] },
        ] }), { status: 200 });
        if (url.includes('keywords=襄阳古城')) return new Response(JSON.stringify({ items: [{ id: 'old-city', name: '襄阳古城', district: '襄城区', location: { lng: 112.151, lat: 32.021 }, photos: ['https://example.com/old-city.jpg'] }] }), { status: 200 });
        if (url.includes('keywords=中国唐城')) return new Response(JSON.stringify({ items: [{ id: 'tang-city', name: '中国唐城', district: '襄城区', location: { lng: 112.195, lat: 31.948 }, photos: ['https://example.com/tang-city.jpg'] }] }), { status: 200 });
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.endsWith('/api/ai/recommend')) return new Response(JSON.stringify({ data: { ranked: [{ id: 'wuhou', reason: '适合拍照', fitScore: 98 }] } }), { status: 200 });
      if (url.endsWith('/api/restaurants/guide')) return new Response(JSON.stringify({ recommendations: [] }), { status: 200 });
      if (url.endsWith('/api/ai/analyze')) return new Response(JSON.stringify({ data: { analysis: '襄阳地标路线。' } }), { status: 200 });
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    });
    vi.stubGlobal('fetch', fetcher);

    const result = await enrichTripPlanWithBackend(plan, request as never);

    expect(result.routePoints?.map((point) => point.name)).toEqual(['古隆中风景区', '襄阳古城', '中国唐城']);
  });

  it('builds a city-scoped Dianping search link for a live AMap restaurant without a verified direct page', () => {
    expect(getDianpingSearchUrl('武汉', '湖边小馆')).toBe('https://www.dianping.com/search/keyword/16/0_%E6%B9%96%E8%BE%B9%E5%B0%8F%E9%A6%86');
    expect(getDianpingSearchUrl('长沙', '湘菜馆')).toContain('/search/keyword/0/0_');
  });
});
