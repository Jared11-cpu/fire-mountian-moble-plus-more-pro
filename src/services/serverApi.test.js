import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../server/index.js';

afterEach(() => vi.restoreAllMocks());

describe('Sites API router', () => {
  it('武汉首页图片支持后端指定，并公开可用素材列表', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/showcase/wuhan'), { WUHAN_HERO_IMAGE: 'river-skyline' });
    const payload = await response.json();
    expect(payload).toMatchObject({ imageId: 'river-skyline', selection: 'configured' });
    expect(payload.availableImageIds).toContain('river-bridge-night');
  });

  it('reports configured capability without exposing secrets', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/health'), { AMAP_WEB_SERVICE_KEY: 'secret', DASHSCOPE_API_KEY: 'secret' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, capabilities: { ai: true, amap: true, vehicleRealtime: false } });
  });

  it('rejects unknown cross-origin callers', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/health', { headers: { Origin: 'https://attacker.test' } }), {});
    expect(response.status).toBe(403);
  });

  it('validates AI configuration before calling the provider', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/ai/parse-request', { method: 'POST', body: JSON.stringify({ text: '武汉两日游' }) }), {});
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: '尚未配置通义千问 API Key' });
  });

  it('parses a Qwen JSON travel request and normalizes fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ city: '武汉', startDate: null, days: 2, people: 1, budgetPerPerson: 500, interests: ['历史'], dietaryNeeds: [], mobility: null, transportPreference: '地铁', hotelPreference: null, departureDeadline: null, requestedPlaces: ['武汉长江大桥'], avoidPlaces: [], travelStyle: '历史江景' }) } }] }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/api/ai/parse-request', { method: 'POST', body: JSON.stringify({ text: '我想一个人去武汉长江大桥，玩两天，预算500，喜欢历史和地铁出行' }) }), { DASHSCOPE_API_KEY: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ city: '武汉', days: 2, people: 1, transportPreference: '地铁', requestedPlaces: ['武汉长江大桥'] });
  });

  it('returns normalized real restaurant facts from AMap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: '1', count: '1', pois: [{ id: 'poi-1', name: '测试餐厅', type: '餐饮服务', location: '114.3,30.5', address: '测试路1号', business: { rating: '4.6', cost: '58', opentime_today: '10:00-22:00' } }] }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/api/restaurants/search?city=武汉&keywords=湖北菜'), { AMAP_WEB_SERVICE_KEY: 'test' });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items[0]).toMatchObject({ id: 'poi-1', name: '测试餐厅', rating: 4.6, averageCost: 58, openingHours: '10:00-22:00', location: { lng: 114.3, lat: 30.5 } });
  });

  it('converts browser GPS coordinates and reverse geocodes the real start address', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', locations: '116.413000,39.910000' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', regeocode: { formatted_address: '北京市朝阳区建国路88号', addressComponent: { province: '北京市', city: [], district: '朝阳区', township: '建外街道', adcode: '110105', streetNumber: { street: '建国路', number: '88号' } } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://example.test/api/location/reverse?location=116.4074,39.9042&coordsys=gps'), { AMAP_WEB_SERVICE_KEY: 'test' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ formattedAddress: '北京市朝阳区建国路88号', city: '北京市', district: '朝阳区', street: '建国路', number: '88号', location: '116.413000,39.910000' });
    expect(fetcher.mock.calls[0][0]).toContain('/v3/assistant/coordinate/convert?');
    expect(fetcher.mock.calls[1][0]).toContain('/v3/geocode/regeo?');
  });

  it('forward geocodes a user-entered starting place without constraining it to the destination city', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: '1', geocodes: [{ formatted_address: '北京市朝阳区建国路88号', province: '北京市', city: '北京市', district: '朝阳区', adcode: '110105', location: '116.457000,39.908000' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://example.test/api/location/geocode?address=北京建国路88号'), { AMAP_WEB_SERVICE_KEY: 'test' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ formattedAddress: '北京市朝阳区建国路88号', location: { lng: 116.457, lat: 39.908 }, coordinateSystem: 'gcj02' });
    expect(fetcher.mock.calls[0][0]).toContain('/v3/geocode/geo?');
    expect(fetcher.mock.calls[0][0]).not.toContain('city=');
  });

  it('rejects an AI recommendation that invents a candidate id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status: 'ok', ranked: [{ id: 'invented', reason: '虚构', fitScore: 99 }], warnings: [] }) } }] }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/api/ai/recommend', { method: 'POST', body: JSON.stringify({ candidates: [{ id: 'real-poi', name: '真实地点' }] }) }), { DASHSCOPE_API_KEY: 'test' });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('无效候选地点');
  });

  it('labels current transit routing as an estimate rather than vehicle GPS realtime', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: '1', route: { transits: [{ distance: '8000', duration: '1200', segments: [{ bus: { buslines: [{ name: '轨道交通2号线', type: '地铁线路', departure_stop: { name: 'A站' }, arrival_stop: { name: 'B站' }, duration: '1200', distance: '8000', polyline: '114.1,30.1;114.2,30.2' }] } }] }] } }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/api/transit/realtime?city=武汉&origin=114.1,30.1&destination=114.2,30.2'), { AMAP_WEB_SERVICE_KEY: 'test' });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ freshness: 'live-query', capability: 'dynamic-route-estimate', vehicleRealtimeAvailable: false });
    expect(body.segments[0].mode).toBe('地铁');
  });

  it('resolves an unlisted city before requesting nationwide transit routes', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', districts: [{ name: '长沙市', citycode: '0731', adcode: '430100' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', route: { transits: [{ distance: '5500', cost: { duration: '1560', transit_fee: '3' }, segments: [{ bus: { buslines: [{ name: '轨道交通2号线', type: '地铁线路', departure_stop: { name: '五一广场' }, arrival_stop: { name: '溁湾镇' }, cost: { duration: '720' }, distance: '4200' }] } }] }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/transit/realtime?city=长沙&origin=112.982279,28.19409&destination=112.938814,28.183364'), { AMAP_WEB_SERVICE_KEY: 'test' });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.segments[0]).toMatchObject({ mode: '地铁', fare: 3 });
    expect(fetcher.mock.calls[0][0]).toContain('/v3/config/district?');
    expect(fetcher.mock.calls[1][0]).toContain('city1=0731');
    expect(fetcher.mock.calls[1][0]).toContain('city2=0731');
  });

  it('accepts only complete daytime AI schedules with enough travel time', async () => {
    const valid = { departureTime: '07:45', items: [{ id: 'start', day: 1, arrivalTime: '08:00', reason: '安全抵达起点' }, { id: 'museum', day: 1, arrivalTime: '10:00', reason: '上午参观' }], safetyNotes: ['21:30 前结束'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 })));
    const request = () => new Request('https://example.test/api/ai/schedule', { method: 'POST', body: JSON.stringify({ city: '武汉', days: 1, points: [{ id: 'start', name: '武汉站', day: 1, stayMinutes: 30, travelMinutesToNext: 60 }, { id: 'museum', name: '湖北省博物馆', day: 1, stayMinutes: 90, travelMinutesToNext: 0 }] }) });

    const response = await worker.fetch(request(), { DASHSCOPE_API_KEY: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ departureTime: '07:45', safetyNotes: ['21:30 前结束'] });

    const unsafe = { ...valid, items: valid.items.map((item, index) => index === 1 ? { ...item, arrivalTime: '00:20' } : item) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(unsafe) } }] }), { status: 200 })));
    const rejected = await worker.fetch(request(), { DASHSCOPE_API_KEY: 'test' });
    expect(rejected.status).toBe(502);
    expect((await rejected.json()).error).toContain('安全时段');
  });

  it('searches explicit required places across all AMap POI types', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: '1', count: '1', pois: [{ id: 'bridge', name: '武汉长江大桥', type: '地名地址信息', location: '114.288,30.550' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/attractions/search?city=武汉&keywords=武汉长江大桥&allTypes=1'), { AMAP_WEB_SERVICE_KEY: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].name).toBe('武汉长江大桥');
    expect(fetcher.mock.calls[0][0]).not.toContain('types=');
  });

  it('searches explicit required places across all AMap POI types', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: '1', count: '1', pois: [{ id: 'bridge', name: '武汉长江大桥', type: '地名地址信息', location: '114.288,30.550' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/attractions/search?city=武汉&keywords=武汉长江大桥&allTypes=1'), { AMAP_WEB_SERVICE_KEY: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].name).toBe('武汉长江大桥');
    expect(fetcher.mock.calls[0][0]).not.toContain('types=');
  });

  it('converts WGS-84 coordinates before server-side driving planning', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', locations: '114.006000,30.006000' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', route: { taxi_cost: '18', paths: [{ distance: '1200', cost: { duration: '300' }, steps: [{ instruction: '沿东山大道行驶', road_name: '东山大道', polyline: '114.006,30.006;114.2,30.2' }] }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/route/plan', {
      method: 'POST',
      body: JSON.stringify({ mode: 'driving', origin: { lng: 114, lat: 30, coordinateSystem: 'wgs84' }, destination: { lng: 114.2, lat: 30.2 } }),
    }), { AMAP_WEB_SERVICE_KEY: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).paths[0]).toMatchObject({ distanceKm: 1.2, durationMinutes: 5, taxiCost: 18, coordinateSystem: 'gcj02', geometrySource: 'amap-directions-v5', polylines: [[[114.006, 30.006], [114.2, 30.2]]], steps: [{ instruction: '沿东山大道行驶', road: '东山大道' }] });
    expect(fetcher.mock.calls[0][0]).toContain('/v3/assistant/coordinate/convert?');
    expect(fetcher.mock.calls[1][0]).toContain('origin=114.006000%2C30.006000');
  });

  it('orchestrates restaurant facts and AI ranking in one guide endpoint', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', count: '1', pois: [{ id: 'poi-1', name: '湖北菜馆', location: '114.3,30.5', business: { rating: '4.7', cost: '66' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status: 'ok', ranked: [{ id: 'poi-1', reason: '预算合适且评分较高', fitScore: 92 }], warnings: ['营业时间需复核'] }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/restaurants/guide', { method: 'POST', body: JSON.stringify({ city: '武汉', keywords: '湖北菜', preferences: { budgetPerPerson: 100 } }) }), { AMAP_WEB_SERVICE_KEY: 'amap', DASHSCOPE_API_KEY: 'qwen' });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ category: 'restaurant', status: 'ok', source: 'amap+qwen', candidateCount: 1 });
    expect(body.recommendations[0]).toMatchObject({ id: 'poi-1', name: '湖北菜馆', averageCost: 66, fitScore: 92, recommendationReason: '预算合适且评分较高' });
  });

  it('searches around every route point and keeps multiple real restaurants before AI ranking', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', count: '1', pois: [{ id: 'shop-1', name: '东站家常菜', location: '111.369,30.692', adname: '伍家岗区', business: { rating: '4.6', cost: '48' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', count: '1', pois: [{ id: 'shop-2', name: '三峡鱼馆', location: '111.052,30.821', adname: '夷陵区', business: { rating: '4.7', cost: '78' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status: 'ok', ranked: [{ id: 'shop-2', reason: '靠近第二个路线点且符合本地菜偏好', fitScore: 95 }], warnings: [] }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/restaurants/guide', {
      method: 'POST',
      body: JSON.stringify({ city: '宜昌', keywords: '餐厅', limit: 12, radiusMeters: 1500, routePoints: [{ id: 'station', name: '宜昌东站', lng: 111.3706, lat: 30.6913 }, { id: 'square', name: '三峡工程党建文化广场', lng: 111.05, lat: 30.82 }], preferences: { budgetPerPerson: 60 } }),
    }), { AMAP_WEB_SERVICE_KEY: 'amap', DASHSCOPE_API_KEY: 'qwen' });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recommendations).toHaveLength(2);
    expect(body.recommendations[0]).toMatchObject({ id: 'shop-2', nearestRoutePoint: { id: 'square', name: '三峡工程党建文化广场' }, recommendationReason: '靠近第二个路线点且符合本地菜偏好' });
    expect(body.recommendations[1]).toMatchObject({ id: 'shop-1', nearestRoutePoint: { id: 'station', name: '宜昌东站' } });
    expect(fetcher.mock.calls[0][0]).toContain('/v5/place/around?');
    expect(fetcher.mock.calls[1][0]).toContain('/v5/place/around?');
    expect(fetcher.mock.calls[0][0]).toContain('radius=1500');
  });

  it('uses the configured Workspace endpoint and reports unsupported providers', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ city: '武汉', interests: [], dietaryNeeds: [] }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const ok = await worker.fetch(new Request('https://example.test/api/ai/parse-request', { method: 'POST', body: JSON.stringify({ text: '武汉旅行' }) }), { DASHSCOPE_API_KEY: 'test', DASHSCOPE_WORKSPACE_ID: 'workspace-123' });
    expect(ok.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe('https://workspace-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
    const unsupported = await worker.fetch(new Request('https://example.test/api/ai/parse-request', { method: 'POST', body: JSON.stringify({ text: '武汉旅行' }) }), { AI_PROVIDER: 'unknown', DASHSCOPE_API_KEY: 'test' });
    expect(unsupported.status).toBe(503);
    expect((await unsupported.json()).error).toContain('不支持的 AI 服务');
  });
});
