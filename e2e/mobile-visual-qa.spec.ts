import { expect, test } from '@playwright/test';

test('mobile result page keeps the map dominant and sheet usable', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/attractions/search')) {
      return route.fulfill({ json: { items: [{ id: 'bridge', name: '宜昌长江大桥', district: '伍家岗区', address: '长江之上', location: { lng: 111.307, lat: 30.664 }, photos: [] }] } });
    }
    if (url.includes('/api/ai/recommend')) {
      return route.fulfill({ json: { data: { ranked: [{ id: 'bridge', reason: '顺路游览', fitScore: 95 }] } } });
    }
    if (url.includes('/api/restaurants/guide')) {
      return route.fulfill({ json: { generatedAt: '2026-07-27T12:00:00.000Z', recommendations: [] } });
    }
    if (url.includes('/api/ai/analyze')) {
      return route.fulfill({ json: { data: { analysis: '沿江串联城市地标，减少折返。' } } });
    }
    if (url.includes('/api/ai/schedule')) {
      return route.fulfill({ status: 503, json: { error: 'use local schedule' } });
    }
    if (url.includes('/api/route/plan')) {
      return route.fulfill({ json: { paths: [{ durationMinutes: 18, distanceKm: 5.2, polyline: [[111.286, 30.692], [111.307, 30.664]], steps: [] }] } });
    }
    return route.fulfill({ status: 503, json: { error: 'visual QA fallback' } });
  });

  await page.goto('/#/planner');
  await page.getByRole('button', { name: /生成我的.*行程/ }).click();
  await page.getByRole('region', { name: '路线地图' }).waitFor();
  await page.screenshot({ path: 'output/playwright/mobile-redesign-peek.png' });

  const layout = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const header = document.querySelector<HTMLElement>('.immersive-header');
    const map = document.querySelector<HTMLElement>('[aria-label="路线地图"]')?.getBoundingClientRect();
    const sheet = document.querySelector<HTMLElement>('[aria-label="方案详情"]')?.getBoundingClientRect();
    return {
      viewport,
      horizontalOverflow: document.documentElement.scrollWidth - viewport.width,
      globalHeaderVisible: header ? getComputedStyle(header).display !== 'none' : false,
      mapHeight: map?.height ?? 0,
      sheetHeight: sheet?.height ?? 0,
    };
  });

  expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(layout.globalHeaderVisible).toBe(false);
  expect(layout.mapHeight).toBeGreaterThan(580);
  expect(layout.sheetHeight).toBeGreaterThan(200);
  await expect(page.getByRole('tab')).toHaveCount(7);
  const tabBoxes = await page.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().toJSON()));
  expect(tabBoxes.every((box) => box.left >= 0 && box.right <= 390)).toBe(true);

  await page.getByRole('button', { name: '展开概览详情' }).click();
  await page.screenshot({ path: 'output/playwright/mobile-redesign-half.png' });
  await page.getByRole('tab', { name: '路线' }).click();
  await expect(page.getByRole('heading', { name: '地点安排' })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/mobile-redesign-route.png' });

  const unexpectedErrors = errors.filter((message) =>
    !message.includes('ERR_CONNECTION_REFUSED') &&
    !message.includes('503 (Service Unavailable)') &&
    !message.includes('Unimplemented type: 3'),
  );
  expect(unexpectedErrors).toEqual([]);
  console.log(JSON.stringify(layout));
});
