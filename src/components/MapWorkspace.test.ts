import { describe, expect, it } from 'vitest';
import { baseRoutes } from '../data/routeData';
import type { PlannedRoutePoint } from '../domain/trip';
import type { TransportPlanResponse, TransportSegment } from '../services/transportService';
import { addTransportClock, alignTransportDepartureTime, compactTravelTip, formatTransportDistance, getAmapRouteUrl, getBudgetUsageVisual, getDianpingShopDetailUrl, getHourlyChartScale, getPointDetailLinks, getPointPrimaryDetailLink, getPointServiceLinks, getRailwayStationTimetableUrl, getTransportLegPreview, getTransportLegStations, getTransportSegmentAriaLabel, getTransportSegmentCompactSummary, getVerifiedCtripDetailUrl, getXiaohongshuGuideUrl, isDirectCtripDetailUrl, normalizeActualStayMinutes, normalizeTravelMinutes, recalculateEditableTimeline } from './MapWorkspace';
import { getFocusedTransportPath, getFocusedTransportSegmentPoints } from './RouteMap';

describe('getPointServiceLinks', () => {
  it('assigns every planned stop its own traceable representative cover', () => {
    for (const route of Object.values(baseRoutes)) {
      const covers = route.points.map((point) => point.imageUrl);
      expect(covers.every(Boolean), route.city).toBe(true);
      expect(new Set(covers).size, `${route.city} route covers`).toBe(route.points.length);
      for (const point of route.points) {
        expect(point.imageCredit?.sourceUrl, `${route.city} / ${point.name}`).toContain('commons.wikimedia.org/wiki/File:');
      }
    }
  });

  it('routes railway stations to official 12306 services', () => {
    const links = getPointServiceLinks({ name: '宜昌东站', city: '宜昌', type: 'start' }, '2026-07-19');

    expect(links.kind).toBe('railway');
    expect(links.detailUrl).toBeUndefined();
    expect(links.bookingUrl).toContain('12306.cn');
    expect(links.amapUrl).toContain(encodeURIComponent('宜昌 宜昌东站'));
    expect(links.timetableUrl).toBe('https://www.crecc.com/hubei/yichang/yichangdong.html');
  });

  it('uses a no-input station-specific timetable as the railway primary action', () => {
    expect(getPointPrimaryDetailLink({ name: '武汉站', city: '武汉', type: 'start' }, '2026-07-19')).toMatchObject({
      source: 'railway',
      label: '全部车次 · 武汉站',
      url: 'https://www.crecc.com/hubei/wuhan/wuhan.html',
    });
  });

  it('builds zero-input detailed timetable pages for every supported Hubei start station', () => {
    const expectedPaths = {
      武汉站: '/hubei/wuhan/wuhan.html',
      宜昌东站: '/hubei/yichang/yichangdong.html',
      恩施站: '/hubei/enshi/enshi.html',
      荆州站: '/hubei/jingzhou/jingzhou.html',
      襄阳东站: '/hubei/xiangyang/xiangyangdong.html',
      黄石北站: '/hubei/huangshi/huangshibei.html',
    } as const;
    for (const [stationName, pathname] of Object.entries(expectedPaths)) {
      const url = new URL(getRailwayStationTimetableUrl(stationName, '2026-07-19'));
      expect(url.origin).toBe('https://www.crecc.com');
      expect(url.pathname).toBe(pathname);
      expect(url.search).toBe('');
    }
  });

  it('opens the Xiangyang East all-trains page directly without any user-entered query', () => {
    expect(getPointPrimaryDetailLink({ name: '襄阳东站', city: '襄阳', type: 'start' }, '2026-07-21')).toEqual({
      source: 'railway',
      label: '全部车次 · 襄阳东站',
      ariaLabel: '襄阳东站全部经过车次与到发时间',
      url: 'https://www.crecc.com/hubei/xiangyang/xiangyangdong.html',
    });
  });

  it('routes every non-station point to Ctrip details and ticket search', () => {
    const links = getPointServiceLinks({ name: '坛子岭观景台', city: '宜昌', type: 'scenic' });

    expect(links.kind).toBe('attraction');
    expect(links.detailUrl).toBe('https://you.ctrip.com/sight/yichang313/46345.html');
    expect(links.bookingUrl).toContain('m.ctrip.com');
    expect(links.bookingUrl).toContain(encodeURIComponent('宜昌 坛子岭观景台'));
  });

  it('uses the verified Ctrip detail page for the Three Gorges visitor center', () => {
    const links = getPointServiceLinks({ name: '三峡游客中心', city: '宜昌', type: 'rest' });

    expect(links.detailUrl).toBe('https://you.ctrip.com/traffic/yichang313/g51289164.html');
    expect(links.bookingUrl).toContain(encodeURIComponent('宜昌 三峡游客中心'));
  });

  it('opens the exact Wuhan University detail page instead of a city guide', () => {
    const links = getPointServiceLinks({ name: '武汉大学', city: '武汉', type: 'scenic', lat: 30.538, lng: 114.365 });

    expect(links.detailUrl).toBe('https://you.ctrip.com/sight/145/1493507.html');
  });

  it('does not disguise another page as the detail page for an unmapped attraction', () => {
    const links = getPointServiceLinks({ name: '临时点位', city: '武汉', type: 'scenic', lat: 30.5, lng: 114.3 });

    expect(links.detailUrl).toBeUndefined();
    expect(links.amapUrl).toContain('uri.amap.com/marker');
    expect(links.amapUrl).toContain('position=114.3,30.5');
    expect(new URL(links.communityUrl).searchParams.get('keyword')).toBe('武汉 临时点位 游玩攻略');
  });

  it('gives every point AMap plus an honest detail source', () => {
    expect(getPointDetailLinks({ name: '东湖磨山景区', city: '武汉', type: 'scenic', lat: 30.54, lng: 114.42 })).toEqual([
      expect.objectContaining({ source: 'amap', label: '高德 · 地点地图' }),
      expect.objectContaining({ source: 'ctrip', label: '携程 · 景点详情', url: 'https://you.ctrip.com/sight/wuhan145/119306.html' }),
    ]);
    expect(getPointDetailLinks({ name: '东湖·香榭水岸', city: '武汉', type: 'scenic', lat: 30.55, lng: 114.4 })).toEqual([
      expect.objectContaining({ source: 'amap' }),
      expect.objectContaining({ source: 'xiaohongshu', label: '小红书 · 攻略搜索' }),
    ]);
  });

  it('keeps railway cards connected to AMap, 12306, and Xiaohongshu', () => {
    expect(getPointDetailLinks({ name: '武汉站', city: '武汉', type: 'start', lat: 30.607, lng: 114.424 }, '2026-07-19').map((link) => link.source)).toEqual(['amap', 'railway', 'xiaohongshu']);
  });

  it('builds an official Xiaohongshu web search for unmatched places', () => {
    const url = new URL(getXiaohongshuGuideUrl({ name: '东湖·楚天府', city: '武汉' }));
    expect(url.hostname).toBe('www.xiaohongshu.com');
    expect(url.pathname).toBe('/search_result');
    expect(url.searchParams.get('keyword')).toBe('武汉 东湖·楚天府 游玩攻略');
  });

  it('always provides a direct primary detail link with AMap as the honest fallback', () => {
    expect(getPointPrimaryDetailLink({ name: '武汉大学', city: '武汉', type: 'scenic' })).toMatchObject({
      source: 'ctrip',
      label: '携程 · 景点详情',
      url: 'https://you.ctrip.com/sight/145/1493507.html',
    });
    expect(getPointPrimaryDetailLink({ name: '临时点位', city: '武汉', type: 'scenic', lat: 30.5, lng: 114.3 })).toMatchObject({
      source: 'amap',
      label: '高德 · 地点信息',
    });
    expect(getPointPrimaryDetailLink({ name: '临时点位', city: '武汉', type: 'scenic', lat: 30.5, lng: 114.3 }).url).toContain('uri.amap.com/marker');
  });

  it('maps a Three Gorges sub-area to the verified direct Ctrip attraction page', () => {
    expect(getVerifiedCtripDetailUrl({ name: '三峡工程党建文化广场', type: 'scenic' })).toBe('https://you.ctrip.com/sight/yichang313/140201.html');
  });

  it('rejects Ctrip home, search, city guide, and category pages as detail links', () => {
    expect(isDirectCtripDetailUrl('https://www.ctrip.com/')).toBe(false);
    expect(isDirectCtripDetailUrl('https://you.ctrip.com/searchsite/sight/?query=test')).toBe(false);
    expect(isDirectCtripDetailUrl('https://you.ctrip.com/place/yichang313.html')).toBe(false);
    expect(isDirectCtripDetailUrl('https://you.ctrip.com/food/jingzhou413.html')).toBe(false);
  });

  it('binds every planned route point to a direct Ctrip page instead of the retired search route', () => {
    for (const route of Object.values(baseRoutes)) {
      for (const point of route.points) {
        const links = getPointServiceLinks(point);
        if (point.type !== 'start' && point.name !== '黄石港饼老店') {
          expect(isDirectCtripDetailUrl(links.detailUrl), `${point.city} / ${point.name}`).toBe(true);
          expect(links.detailUrl, `${point.city} / ${point.name}`).not.toContain('/searchsite/');
        }
        expect(links.bookingUrl, `${point.city} / ${point.name}`).toContain('m.ctrip.com/');
        expect(links.bookingUrl, `${point.city} / ${point.name}`).toContain(encodeURIComponent(`${point.city} ${point.name}`));
      }
    }
  });
});

describe('normalizeActualStayMinutes', () => {
  it('keeps actual stay entries within a full-day range', () => {
    expect(normalizeActualStayMinutes(75.4)).toBe(75);
    expect(normalizeActualStayMinutes(-8)).toBe(0);
    expect(normalizeActualStayMinutes(1600)).toBe(1440);
    expect(normalizeActualStayMinutes('')).toBe(0);
  });
});

describe('editable next-leg transport', () => {
  it('normalizes custom transport minutes', () => {
    expect(normalizeTravelMinutes(35.6)).toBe(36);
    expect(normalizeTravelMinutes(-1)).toBe(0);
    expect(normalizeTravelMinutes(2000)).toBe(1440);
  });

  it('updates every downstream arrival after a custom transport edit', () => {
    const source = baseRoutes.武汉.points.slice(0, 3).map((point, index) => ({
      ...point, arrivalTime: '', durationMinutes: [10, 20, 30][index], travelMinutesToNext: [30, 5, 0][index],
    }));
    const result = recalculateEditableTimeline(source as never, '08:30');

    expect(result.map((point) => point.arrivalTime)).toEqual(['08:45', '09:25', '09:50']);
    expect(result[0].travelMinutesToNext).toBe(30);
  });
});

describe('AMap-style transport segment summaries', () => {
  it('formats walking distance in meters and named transit with stops', () => {
    expect(formatTransportDistance(0.42)).toBe('420 米');
    expect(getTransportLegPreview({ id: 'walk', mode: 'walk', viaStops: [], durationMinutes: 6, distanceKm: 0.42, polyline: [] })).toEqual({ headline: '步行 420 米', detail: '约 6 分钟', meta: '' });
    expect(getTransportLegPreview({ id: 'subway', mode: 'subway', lineName: '地铁2号线', departureStop: '武汉站东广场', arrivalStop: '洪山广场', entrance: 'A口', exit: 'C口', viaStops: ['杨春湖', '武汉火车站'], durationMinutes: 18, distanceKm: 9.6, fare: 4, polyline: [] })).toEqual({ headline: '地铁2号线', detail: 'A口进站 · 武汉站东广场上车 → 洪山广场下车 · C口出站', meta: '途经 2 站' });
  });

  it('does not invent a bus number when dynamic route details are unavailable', () => {
    expect(getTransportLegPreview({ id: 'estimate', mode: 'bus', viaStops: [], durationMinutes: 12, distanceKm: 2.8, polyline: [] })).toEqual({ headline: '公交线路待动态查询', detail: '上下车站待动态查询', meta: '12 分钟' });
  });

  it('shows named roads and turn guidance for a driving leg', () => {
    expect(getTransportLegPreview({ id: 'drive', mode: 'taxi', lineName: '驾车路线', viaStops: [], durationMinutes: 18, distanceKm: 9.4, fare: 28, roadNames: ['东山大道', '桔城路'], instructions: ['沿东山大道向西行驶'], polyline: [] })).toEqual({ headline: '经 东山大道 → 桔城路', detail: '沿东山大道向西行驶', meta: '约 ¥28' });
  });

  it('builds a complete ordered station timeline without duplicate terminals', () => {
    expect(getTransportLegStations({ id: 'line', mode: 'subway', departureStop: '武汉站东广场', arrivalStop: '光谷广场', viaStops: ['洪山广场', '街道口', '光谷广场'], durationMinutes: 32, distanceKm: 16, polyline: [] })).toEqual(['武汉站东广场', '洪山广场', '街道口', '光谷广场']);
    expect(addTransportClock('23:55', 18)).toBe('00:13');
  });

  it('includes time, route, and fare in the accessible card label', () => {
    const segment: TransportSegment = { id: 'segment', from: '武汉站', to: '武汉东湖', departureTime: '08:55', arrivalTime: '09:22', durationMinutes: 27, distanceKm: 10, mode: '地铁', costEstimate: '¥4', instruction: '', legs: [{ id: 'line', mode: 'subway', lineName: '地铁2号线', viaStops: [], durationMinutes: 18, distanceKm: 9.6, polyline: [] }] };
    expect(getTransportSegmentAriaLabel(segment, 0, false)).toContain('08:55 出发，09:22 到达；地铁2号线；费用 ¥4');
  });

  it('creates a direct AMap route link with coordinates, names, mode and policy', () => {
    const segment: TransportSegment = { id: 'segment', from: '武汉站', to: '光谷广场', origin: { lng: 114.4244, lat: 30.6072 }, destination: { lng: 114.397, lat: 30.505 }, departureTime: '08:55', arrivalTime: '09:37', durationMinutes: 42, distanceKm: 21.3, mode: '公交', costEstimate: '¥4', instruction: '', legs: [{ id: 'line', mode: 'bus', lineName: '521路', viaStops: [], durationMinutes: 42, distanceKm: 21.3, polyline: [] }] };
    const url = new URL(getAmapRouteUrl(segment, 'fewest-transfers'));
    expect(url.origin + url.pathname).toBe('https://uri.amap.com/navigation');
    expect(url.searchParams.get('from')).toBe('114.424400,30.607200,武汉站');
    expect(url.searchParams.get('to')).toBe('114.397000,30.505000,光谷广场');
    expect(url.searchParams.get('mode')).toBe('bus');
    expect(url.searchParams.get('policy')).toBe('1');
    expect(url.searchParams.get('callnative')).toBe('1');
  });

  it('shifts the whole transport schedule so the first segment uses the custom departure time', () => {
    const points = [
      { id: 'a', name: '武汉站', lat: 30.6, lng: 114.4, arrivalTime: '08:45', time: '08:45', durationMinutes: 10, travelMinutesToNext: 42, stayMinutes: 10 },
      { id: 'b', name: '东湖', lat: 30.5, lng: 114.3, arrivalTime: '09:37', time: '09:37', durationMinutes: 60, travelMinutesToNext: 0, stayMinutes: 60 },
    ] as PlannedRoutePoint[];
    const shifted = alignTransportDepartureTime(points, '09:20');
    expect(addTransportClock(shifted[0].arrivalTime, shifted[0].durationMinutes)).toBe('09:20');
    expect(shifted[1].arrivalTime).toBe('10:02');
  });

  it('keeps dense multi-line transit routes to two visible summary items', () => {
    const segment: TransportSegment = { id: 'dense', from: 'A', to: 'B', departureTime: '10:37', arrivalTime: '11:22', durationMinutes: 45, distanceKm: 6.6, mode: '公交', costEstimate: '¥4', instruction: '', legs: [
      { id: 'walk', mode: 'walk', viaStops: [], durationMinutes: 9, distanceKm: 0.8, polyline: [] },
      { id: '531', mode: 'bus', lineName: '531路', viaStops: [], durationMinutes: 8, distanceKm: 1, polyline: [] },
      { id: '589', mode: 'bus', lineName: '589路', viaStops: [], durationMinutes: 8, distanceKm: 1, polyline: [] },
      { id: '791', mode: 'bus', lineName: '791路', viaStops: [], durationMinutes: 8, distanceKm: 1, polyline: [] },
    ] };
    expect(getTransportSegmentCompactSummary(segment)).toEqual({ items: ['步行 800 米', '531路'], hiddenCount: 2, walkingDistanceKm: 0.8 });
  });
});

describe('compactTravelTip', () => {
  it('replaces verbose generated guidance with a concise note', () => {
    expect(compactTravelTip('记录这一站是否符合“武汉两天一夜，预算600元，喜欢拍照和美食”的原始期待。', '记下最喜欢的细节。')).toBe('记下最喜欢的细节。');
    expect(compactTravelTip('围绕“拍照”主题记录武汉大学，现场遵守拍摄与开放规定。', '拍下武汉大学的代表性画面。')).toBe('拍下武汉大学的代表性画面。');
  });

  it('caps long custom tips without producing a dense paragraph', () => {
    const tip = compactTravelTip('这是一个非常非常长的拍摄建议，需要在卡片里保持简洁并避免占用过多空间。', '拍下代表性画面。', 16);
    expect(tip.length).toBeLessThanOrEqual(16);
    expect(tip).toMatch(/…$/);
  });
});

describe('getHourlyChartScale', () => {
  it('adds readable padding around the observed temperature range', () => {
    const scale = getHourlyChartScale([
      { time: '2026-07-14T10:00', temperature: 34, rainProbability: 0, code: 1 },
      { time: '2026-07-14T11:00', temperature: 38, rainProbability: 20, code: 2 },
    ]);

    expect(scale).toEqual({ temperatureMin: 33, temperatureMax: 39 });
  });

  it('keeps a non-zero range when every hour has the same temperature', () => {
    const scale = getHourlyChartScale([
      { time: '2026-07-14T10:00', temperature: 35, rainProbability: 0, code: 0 },
      { time: '2026-07-14T11:00', temperature: 35, rainProbability: 0, code: 0 },
    ]);

    expect(scale.temperatureMax).toBeGreaterThan(scale.temperatureMin);
  });
});

describe('getDianpingShopDetailUrl', () => {
  it('accepts only direct Dianping shop detail pages', () => {
    expect(getDianpingShopDetailUrl('https://www.dianping.com/shop/l3LoOn1gi2ggY01E')).toBe('https://www.dianping.com/shop/l3LoOn1gi2ggY01E');
    expect(getDianpingShopDetailUrl('https://m.dianping.com/shop/128523373')).toBe('https://m.dianping.com/shop/128523373');
  });

  it('rejects search, homepage, and unrelated links', () => {
    expect(getDianpingShopDetailUrl('https://www.dianping.com/search/keyword/16/0_test')).toBeUndefined();
    expect(getDianpingShopDetailUrl('https://www.dianping.com/')).toBeUndefined();
    expect(getDianpingShopDetailUrl('https://example.com/shop/123')).toBeUndefined();
  });
});

describe('getBudgetUsageVisual', () => {
  it('calculates usage from actual spending divided by the planned budget', () => {
    expect(getBudgetUsageVisual(150, 600)).toMatchObject({ percent: 25, clampedPercent: 25, fillPercent: 25, difference: 450 });
    expect(getBudgetUsageVisual(400, 600)).toMatchObject({ percent: 67, fillPercent: 67, difference: 200 });
    expect(getBudgetUsageVisual(600, 600)).toMatchObject({ percent: 100, clampedPercent: 100, fillPercent: 100, difference: 0 });
    expect(getBudgetUsageVisual(720, 600)).toMatchObject({ percent: 120, clampedPercent: 100, fillPercent: 100, difference: -120 });
  });

  it('uses one solid card color: green at zero, yellow at 60%, and red from 80%', () => {
    expect(getBudgetUsageVisual(0, 600).color).toBe('hsl(152 72% 36%)');
    expect(getBudgetUsageVisual(360, 600).color).toBe('hsl(44 82% 48%)');
    expect(getBudgetUsageVisual(480, 600).color).toBe('hsl(4 76% 46%)');
    expect(getBudgetUsageVisual(600, 600).color).toBe('hsl(2 76% 42%)');
    expect(getBudgetUsageVisual(0, 600)).not.toHaveProperty('background');
  });

  it('deepens the red as spending exceeds the budget', () => {
    expect(getBudgetUsageVisual(900, 600).color).toBe('hsl(357 77% 33%)');
    expect(getBudgetUsageVisual(1200, 600).color).toBe('hsl(352 78% 24%)');
    expect(getBudgetUsageVisual(1800, 600).color).toBe(getBudgetUsageVisual(1200, 600).color);
  });
});

describe('getFocusedTransportPath', () => {
  it('returns only the selected segment geometry for map focus', () => {
    const plan = {
      source: 'transport-api',
      freshness: 'live-query',
      segments: [
        { id: 'segment-1', legs: [{ polyline: [[111, 30], [111.1, 30.1]] }] },
        { id: 'segment-2', legs: [{ polyline: [[112, 31], [112.1, 31.1]] }, { polyline: [[112.1, 31.1], [112.2, 31.2]] }] },
      ],
    } as TransportPlanResponse;

    expect(getFocusedTransportPath(plan, 'segment-2')).toEqual([[112, 31], [112.1, 31.1], [112.1, 31.1], [112.2, 31.2]]);
    expect(getFocusedTransportPath(plan, 'missing')).toEqual([]);
    expect(getFocusedTransportPath({ ...plan, source: 'rules-fallback', freshness: 'estimate' } as TransportPlanResponse, 'segment-2')).toEqual([]);
  });

  it('maps a focused transport segment back to its adjacent route points', () => {
    const route = { points: baseRoutes.宜昌.points.slice(0, 3) } as never;
    const plan = { segments: [{ id: 'first' }, { id: 'second' }] } as TransportPlanResponse;

    expect(getFocusedTransportSegmentPoints(route, plan, 'second').map((point) => point.name)).toEqual(baseRoutes.宜昌.points.slice(1, 3).map((point) => point.name));
    expect(getFocusedTransportSegmentPoints(route, plan, 'missing')).toEqual([]);
  });
});
