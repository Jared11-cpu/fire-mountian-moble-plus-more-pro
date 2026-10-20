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

  it('reports the deployed API build without leaking other env values', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/health'), { API_BUILD_SHA: 'abc123', DASHSCOPE_API_KEY: 'secret' });
    const payload = await response.json();
    expect(payload.build).toMatchObject({ sha: 'abc123', builtAt: 'unknown' });
    expect(JSON.stringify(payload)).not.toContain('secret');
  });

  it('reports unknown build when no SHA is configured', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/health'), {});
    expect((await response.json()).build).toEqual({ sha: 'unknown', builtAt: 'unknown' });
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

  it('fills explicit travel facts when Qwen returns an empty but valid structure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ city: null, startDate: null, days: null, people: null, budgetPerPerson: null, interests: [], dietaryNeeds: [], mobility: null, transportPreference: null, hotelPreference: null, departureDeadline: null, requestedPlaces: [], avoidPlaces: [], travelStyle: null }) } }] }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/api/ai/parse-request', { method: 'POST', body: JSON.stringify({ text: '襄阳两天一夜，预算600元，喜欢拍照和美食，不吃辣' }) }), { DASHSCOPE_API_KEY: 'test' });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      city: '襄阳',
      days: 2,
      budgetPerPerson: 600,
      interests: ['拍照', '美食'],
      dietaryNeeds: ['不吃辣'],
    });
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

  it('builds a business plan from AMap-verified places and keeps food lines to real restaurants', async () => {
    const copy = {
      route: ['09:30 出发去三峡大坝', '12:00 午餐', '14:30 滨江公园', '18:00 返回'], welcome: '欢迎入住', reminders: ['提前预约大坝'],
      food: ['杜记凉虾，人均 15 元', '编造的网红餐厅'], videoScript: ['镜头 1'], redbook: '江景民宿', replies: ['可以帮您预约'],
    };
    const fetcher = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/v5/place/text') && url.includes(encodeURIComponent('三峡大坝'))) return new Response(JSON.stringify({ status: '1', pois: [{ id: 'dam', name: '三峡大坝旅游区', adname: '夷陵区', location: '111.00,30.82' }] }), { status: 200 });
      if (url.includes('/v5/place/text')) return new Response(JSON.stringify({ status: '1', pois: [] }), { status: 200 });
      if (url.includes('/v5/place/around')) return new Response(JSON.stringify({ status: '1', pois: [{ id: 'r1', name: '杜记凉虾', adname: '夷陵区', location: '111.01,30.82', business: { cost: '15' } }] }), { status: 200 });
      if (url.includes('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(copy) } }] }), { status: 200 });
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/business/plan', { method: 'POST', body: JSON.stringify({ name: '西陵江景民宿', city: '宜昌', spots: '三峡大坝，不存在的景点', target: '情侣' }) }), { AMAP_WEB_SERVICE_KEY: 'test', DASHSCOPE_API_KEY: 'test' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ source: 'amap+qwen', unmatchedSpots: ['不存在的景点'], food: ['杜记凉虾，人均 15 元'] });
    expect(body.facts.spots[0].name).toBe('三峡大坝旅游区');
    const prompt = JSON.parse(fetcher.mock.calls.find((call) => String(call[0]).includes('/chat/completions'))[1].body).messages[1].content;
    expect(prompt).toContain('杜记凉虾');
    expect(body.route).not.toContain('14:30 滨江公园');
    expect(body.factCheck.removed).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'route', reason: expect.stringContaining('滨江公园') })]));
  });

  describe('business copy fact check', () => {
    const businessRequest = (spots = '三峡大坝') => new Request('https://example.test/api/business/plan', { method: 'POST', body: JSON.stringify({ name: '西陵江景民宿', city: '宜昌', spots, target: '亲子家庭' }) });
    const amapAndQwen = (copy, { around = 'ok', textPois } = {}) => vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/v5/place/text')) return new Response(JSON.stringify({ status: '1', pois: textPois ?? [{ id: 'dam', name: '三峡大坝旅游区', cityname: '宜昌市', adname: '夷陵区', location: '111.00,30.82' }] }), { status: 200 });
      if (url.includes('/v5/place/around')) {
        if (around === 'fail') return new Response(JSON.stringify({ status: '0', infocode: '10001', info: 'INVALID_USER_KEY' }), { status: 200 });
        return new Response(JSON.stringify({ status: '1', pois: [{ id: 'r1', name: '杜记凉虾', adname: '夷陵区', location: '111.01,30.82', business: { cost: '15' } }] }), { status: 200 });
      }
      if (url.includes('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(copy) } }] }), { status: 200 });
      return new Response('{}', { status: 404 });
    });
    const baseCopy = {
      route: ['09:00 前往三峡大坝', '13:00 去黄鹤楼公园拍照', '15:00 三峡大坝24小时开放，免费入园'], welcome: '欢迎入住西陵江景民宿！门票 105 元我们帮您代购。', reminders: ['三峡大坝门票 80 元，开放时间 08:00-17:00'],
      food: ['杜记凉虾，人均 15 元', '杜记凉虾，人均 45 元'], videoScript: ['镜头 1：民宿江景'], redbook: '住在江边，步行可达三峡大坝。打卡编造古镇！', replies: ['预订请致电 13800138000', '可以帮您规划去三峡大坝的路线'],
    };

    it('falls back to facts-only copy and says so when Qwen times out', async () => {
      const amapOnly = amapAndQwen(baseCopy);
      vi.stubGlobal('fetch', vi.fn(async (input, init) => {
        if (String(input).includes('/chat/completions')) throw Object.assign(new Error('timeout'), { name: 'AbortError' });
        return amapOnly(input, init);
      }));
      const response = await worker.fetch(businessRequest(), { AMAP_WEB_SERVICE_KEY: 'test', DASHSCOPE_API_KEY: 'test' });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ source: 'amap-facts', copyError: '通义千问响应超时' });
      expect(body.route.join('')).toContain('三峡大坝旅游区');
      expect(body.food).toEqual(['杜记凉虾，人均约 15 元（夷陵区）']);
    });

    it('drops unverified places, invented prices, ticket/hours claims and phone numbers', async () => {
      vi.stubGlobal('fetch', amapAndQwen(baseCopy));
      const body = await (await worker.fetch(businessRequest(), { AMAP_WEB_SERVICE_KEY: 'test', DASHSCOPE_API_KEY: 'test' })).json();
      expect(body.route).toEqual(['09:00 前往三峡大坝']);
      expect(body.food).toEqual(['杜记凉虾，人均 15 元']);
      expect(body.replies).toEqual(['可以帮您规划去三峡大坝的路线']);
      expect(body.redbook).toBe('住在江边，步行可达三峡大坝。');
      expect(body.welcome).not.toContain('105');
      expect(body.reminders.join('')).not.toContain('80 元');
      expect(body.factCheck.filledFromFacts).toEqual(expect.arrayContaining(['reminders']));
      const reasons = body.factCheck.removed.map((item) => item.reason).join('|');
      expect(reasons).toContain('黄鹤楼公园');
      expect(reasons).toContain('电话');
      expect(reasons).toContain('45');
    });

    it('reports a missing AMap key instead of claiming the spots do not exist', async () => {
      const response = await worker.fetch(businessRequest(), { DASHSCOPE_API_KEY: 'test' });
      expect(response.status).toBe(503);
      expect((await response.json()).error).not.toContain('没有在宜昌找到');
    });

    it('treats a same-name place in another city as unmatched', async () => {
      vi.stubGlobal('fetch', amapAndQwen(baseCopy, { textPois: [{ id: 'dam-other', name: '三峡大坝', cityname: '重庆市', location: '107.0,29.5' }] }));
      const response = await worker.fetch(businessRequest(), { AMAP_WEB_SERVICE_KEY: 'test', DASHSCOPE_API_KEY: 'test' });
      expect(response.status).toBe(422);
    });

    it('does not invent restaurant names when the nearby search fails', async () => {
      vi.stubGlobal('fetch', amapAndQwen({ ...baseCopy, food: ['编造的网红餐厅，人均 99 元'] }, { around: 'fail' }));
      const body = await (await worker.fetch(businessRequest(), { AMAP_WEB_SERVICE_KEY: 'test', DASHSCOPE_API_KEY: 'test' })).json();
      expect(body.restaurantsVerified).toBe(false);
      expect(body.food).toEqual(['周边餐厅暂未查询到，请在地图中搜索附近餐饮。']);
    });
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
    expect(rejected.status).toBe(200);
    const repaired = (await rejected.json()).data;
    expect(repaired).toMatchObject({ departureTime: '07:45', source: 'rules' });
    expect(repaired.items.map((item) => item.arrivalTime)).toEqual(['08:00', '09:30']);
    expect(repaired.safetyNotes[0]).toContain('自动校正');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    const timedOut = await worker.fetch(request(), { DASHSCOPE_API_KEY: 'test' });
    expect(timedOut.status).toBe(200);
    expect((await timedOut.json()).data).toMatchObject({ source: 'rules', departureTime: '08:30' });
  });

  describe('rule schedule fallback keeps the 07:30-21:30 safety window', () => {
    const scheduleRequest = (points) => new Request('https://example.test/api/ai/schedule', { method: 'POST', body: JSON.stringify({ city: '宜昌', days: 2, points }) });
    const aiReply = (content) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
    const overloadedDay = [
      { id: 'a', name: '三峡大坝', day: 1, stayMinutes: 480, travelMinutesToNext: 720 },
      { id: 'b', name: '三峡人家', day: 1, stayMinutes: 480, travelMinutesToNext: 0 },
      { id: 'c', name: '清江画廊', day: 2, stayMinutes: 120, travelMinutesToNext: 0 },
    ];

    it('returns infeasible days instead of fake late-night arrivals when a day cannot fit', async () => {
      vi.stubGlobal('fetch', aiReply('not json'));
      const response = await worker.fetch(scheduleRequest(overloadedDay), { DASHSCOPE_API_KEY: 'test' });
      expect(response.status).toBe(200);
      const data = (await response.json()).data;
      expect(data).toMatchObject({ source: 'rules', status: 'infeasible' });
      expect(data.infeasibleDays).toEqual([expect.objectContaining({ day: 1, pointIds: ['b'] })]);
      expect(data.items.find((item) => item.id === 'b')).toMatchObject({ arrivalTime: null, overflow: true });
      for (const item of data.items.filter((entry) => entry.arrivalTime)) {
        const [hour, minute] = item.arrivalTime.split(':').map(Number);
        expect(hour * 60 + minute).toBeGreaterThanOrEqual(7 * 60 + 30);
        expect(hour * 60 + minute).toBeLessThanOrEqual(21 * 60 + 30);
      }
      expect(data.safetyNotes.join('')).toContain('三峡人家');
    });

    it('falls back to rules when the AI skips ids or mixes up days', async () => {
      const wrongDay = { departureTime: '08:00', items: [{ id: 'a', day: 2, arrivalTime: '08:15', reason: 'x' }, { id: 'c', day: 2, arrivalTime: '09:00', reason: 'x' }], safetyNotes: [] };
      vi.stubGlobal('fetch', aiReply(JSON.stringify(wrongDay)));
      const points = [{ id: 'a', name: '三峡大坝', day: 1, stayMinutes: 120, travelMinutesToNext: 60 }, { id: 'c', name: '清江画廊', day: 2, stayMinutes: 120, travelMinutesToNext: 0 }];
      const data = (await (await worker.fetch(scheduleRequest(points), { DASHSCOPE_API_KEY: 'test' })).json()).data;
      expect(data).toMatchObject({ source: 'rules', status: 'ok', infeasibleDays: [] });
      expect(data.items.map((item) => [item.id, item.day, item.arrivalTime])).toEqual([['a', 1, '08:15'], ['c', 2, '08:15']]);
    });

    it('keeps per-day order even when days are interleaved in the input', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' })));
      const points = [
        { id: 'a', name: 'A', day: 1, stayMinutes: 60, travelMinutesToNext: 30 },
        { id: 'c', name: 'C', day: 2, stayMinutes: 60, travelMinutesToNext: 0 },
        { id: 'b', name: 'B', day: 1, stayMinutes: 60, travelMinutesToNext: 0 },
      ];
      const data = (await (await worker.fetch(scheduleRequest(points), { DASHSCOPE_API_KEY: 'test' })).json()).data;
      expect(data.items.map((item) => item.arrivalTime)).toEqual(['08:45', '08:45', '10:15']);
    });

    it('still reports a missing AI provider configuration as 503', async () => {
      const response = await worker.fetch(scheduleRequest(overloadedDay), {});
      expect(response.status).toBe(503);
    });
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

  it('retries a rate-limited AMap route request instead of failing the user flow', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '0', infocode: '10021', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1', route: { paths: [{ distance: '1800', cost: { duration: '420' }, steps: [{ instruction: '沿测试道路行驶', road_name: '测试道路', polyline: '111.1,30.1;111.2,30.2' }] }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://example.test/api/route/plan', {
      method: 'POST',
      body: JSON.stringify({ mode: 'driving', origin: { lng: 111.1, lat: 30.1 }, destination: { lng: 111.2, lat: 30.2 } }),
    }), { AMAP_WEB_SERVICE_KEY: 'test' });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await response.json()).paths[0]).toMatchObject({ distanceKm: 1.8, durationMinutes: 7 });
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
