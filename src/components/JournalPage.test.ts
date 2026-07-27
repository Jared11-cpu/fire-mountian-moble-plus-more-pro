import { describe, expect, it } from 'vitest';
import { buildCompletedJournalEntries, buildJournalCommunityHighlights, buildJournalGuideCards, buildJournalMapRoute, buildJournalPosterSvg, getJournalAmapUrl, getJournalXiaohongshuUrl, layoutJournalPosterPoints } from './JournalPage';
import type { JournalEntry } from '../types/route';
import { defaultTripRequest, generateTripPlan } from '../domain/trip';

function entry(id: string, pointName: string, lng = 114.3055, lat = 30.5928): JournalEntry {
  return { id, pointId: id, pointName, city: '武汉', day: 1, note: '今天的江风很好。', visitedAt: '2026-07-14', lat, lng, photoIds: [] };
}

describe('journal handwritten route poster', () => {
  it('shows only completed AI itinerary points at their own route coordinates', () => {
    const plan = generateTripPlan(defaultTripRequest('武汉'));
    const [first, second, incomplete] = plan.route.points;
    plan.dailyRecords = plan.dailyRecords.map((record) => record.day === 1 ? { ...record, checkedPointIds: [first.id, second.id] } : record);
    const stored = [entry('manual', second.name), entry('unrelated', incomplete.name)];

    const synced = buildCompletedJournalEntries(stored, plan);

    expect(synced.map((item) => item.pointId)).toEqual([first.id, second.id]);
    expect(synced[1]).toMatchObject({ id: 'manual', pointName: second.name, lat: second.lat, lng: second.lng });
    expect(new Set(synced.map((item) => `${item.lng},${item.lat}`)).size).toBe(2);
  });

  it('turns real journal entries into an AMap route with ordered markers and notes', () => {
    const route = buildJournalMapRoute([entry('1', '武汉站', 114.4244, 30.6072), entry('2', '昙华林', 114.302, 30.552)], undefined, 'real');

    expect(route?.points).toHaveLength(2);
    expect(route?.points[0]).toMatchObject({ id: '1', name: '武汉站', type: 'start' });
    expect(route?.points[1]).toMatchObject({ id: '2', name: '昙华林', type: 'end', recordTip: '今天的江风很好。' });
  });

  it('projects every entry into a route-centered poster map and separates overlapping pins', () => {
    const points = layoutJournalPosterPoints([entry('1', '长江大桥'), entry('2', '黄鹤楼')]);
    expect(points).toHaveLength(2);
    expect(points.every((point) => point.x >= 138 && point.x <= 674 && point.y >= 96 && point.y <= 376)).toBe(true);
    expect(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)).toBeGreaterThan(20);
  });

  it('uses the poster map area to spread nearby Wuhan stops instead of compressing them', () => {
    const points = layoutJournalPosterPoints([
      entry('1', '武汉站', 114.4244, 30.6072),
      entry('2', '东湖', 114.386, 30.557),
      entry('3', '江汉路', 114.281, 30.584),
    ], { x: 135, y: 365, width: 885, height: 1120 });
    const xs = points.map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
  });

  it('builds a square watercolor route poster with separate cards, privacy notice and escaped notes', () => {
    const svg = buildJournalPosterSvg([entry('1', '黄鹤楼 & 长江')], 'real');
    expect(svg).toContain('width="1754" height="1754"');
    expect(svg).toContain('我的旅行路线手账');
    expect(svg).toContain('ROUTE MAP · 路线点图');
    expect(svg).toContain('TRAVEL NOTES · 手账卡片');
    expect(svg).toContain('照片未上传第三方');
    expect(svg).toContain('translate(1165 294)');
    expect(svg).toContain('黄鹤楼 &amp; 长江');
    expect(svg).not.toContain('黄鹤楼 & 长江');
  });

  it('embeds an already inlined local photo in its own journal card', () => {
    const svg = buildJournalPosterSvg([{ ...entry('1', '武汉站'), photoUrl: 'data:image/png;base64,AA==' }], 'real');
    expect(svg).toContain('<image href="data:image/png;base64,AA=="');
  });

  it('builds exact external place links and factual guide cards for itinerary details', () => {
    const point = generateTripPlan(defaultTripRequest('武汉')).route.points[1];
    const xiaohongshu = new URL(getJournalXiaohongshuUrl(point));
    const amap = new URL(getJournalAmapUrl(point));

    expect(xiaohongshu.hostname).toBe('www.xiaohongshu.com');
    expect(xiaohongshu.searchParams.get('keyword')).toBe(`${point.city} ${point.name} 游玩攻略`);
    expect(amap.searchParams.get('position')).toBe(`${point.lng},${point.lat}`);
    expect(buildJournalGuideCards(point).map((card) => card.text)).toEqual([point.reason, point.photoTip, point.recordTip]);
  });

  it('builds three point-specific high-engagement community summaries with focused source links', () => {
    const point = generateTripPlan(defaultTripRequest('武汉')).route.points.find((item) => item.type === 'scenic')!;
    const highlights = buildJournalCommunityHighlights(point);

    expect(highlights).toHaveLength(3);
    expect(highlights[0].summary).toContain(point.name);
    expect(highlights.map((item) => item.topic)).toEqual(['最佳机位', '错峰体验', '现场提醒']);
    for (const item of highlights) {
      const url = new URL(item.url);
      expect(url.hostname).toBe('www.xiaohongshu.com');
      expect(url.searchParams.get('keyword')).toContain(`${point.city} ${point.name}`);
      expect(url.searchParams.get('keyword')).toContain(item.topic);
    }
  });
});
