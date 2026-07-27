import { expect, test, type Page } from '@playwright/test';

const mobileViewports = [
  { name: 'compact', width: 360, height: 800 },
  { name: 'standard', width: 390, height: 844 },
  { name: 'large', width: 430, height: 932 },
] as const;

async function mockTravelServices(page: Page) {
  await page.route('https://webapi.amap.com/**', (route) => route.abort());
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: {
    current: { time: '2026-07-27T10:00', temperature_2m: 31, apparent_temperature: 34, relative_humidity_2m: 70, precipitation: 0, weather_code: 1, wind_speed_10m: 9, wind_gusts_10m: 14 },
    hourly: { time: Array.from({ length: 10 }, (_, index) => `2026-07-27T${String(10 + index).padStart(2, '0')}:00`), temperature_2m: [31, 32, 33, 34, 34, 33, 32, 31, 30, 29], precipitation_probability: [10, 10, 20, 30, 40, 35, 20, 10, 10, 10], weather_code: [1, 1, 2, 2, 80, 80, 3, 2, 1, 1] },
    daily: { time: ['2026-07-27', '2026-07-28', '2026-07-29'], weather_code: [2, 80, 1], temperature_2m_max: [34, 32, 33], temperature_2m_min: [25, 24, 25], precipitation_probability_max: [30, 60, 10], sunrise: ['2026-07-27T05:42', '2026-07-28T05:43', '2026-07-29T05:43'], sunset: ['2026-07-27T19:31', '2026-07-28T19:30', '2026-07-29T19:30'], uv_index_max: [7, 5, 6] },
  } }));
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/ai/parse-request')) return route.fulfill({ json: { data: { city: '宜昌', startDate: '2026-08-01', days: 2, people: 2, budgetPerPerson: 600, interests: ['拍照', '美食'], dietaryNeeds: ['不吃辣'], mobility: null, transportPreference: '公交', hotelPreference: null, departureDeadline: null, requestedPlaces: ['宜昌长江大桥'], avoidPlaces: [], travelStyle: '轻松' } } });
    if (url.includes('/api/location/geocode')) return route.fulfill({ json: { formattedAddress: '宜昌东站', location: { lng: 111.3709, lat: 30.6598 } } });
    if (url.includes('/api/attractions/search')) return route.fulfill({ json: { items: [
      { id: 'bridge', name: '宜昌长江大桥', district: '伍家岗区', address: '沿江大道', location: { lng: 111.307, lat: 30.664 }, photos: [] },
      { id: 'museum', name: '宜昌博物馆', district: '伍家岗区', address: '柏临河路', location: { lng: 111.349, lat: 30.669 }, photos: [] },
      { id: 'riverside', name: '滨江公园', district: '西陵区', address: '沿江大道', location: { lng: 111.285, lat: 30.695 }, photos: [] },
    ] } });
    if (url.includes('/api/ai/recommend')) return route.fulfill({ json: { data: { ranked: [
      { id: 'bridge', reason: '沿江顺路，适合拍照', fitScore: 96 },
      { id: 'museum', reason: '室内文化体验', fitScore: 91 },
      { id: 'riverside', reason: '傍晚散步', fitScore: 88 },
    ] } } });
    if (url.includes('/api/restaurants/guide')) return route.fulfill({ json: { generatedAt: '2026-07-27T10:00:00.000Z', recommendations: [
      { id: 'food-1', name: '峡州小馆', district: '西陵区', address: '沿江大道', averageCost: 52, rating: 4.6, category: '餐饮服务;湖北菜', recommendationReason: '靠近滨江路线', nearestRoutePoint: { name: '滨江公园' }, routeDistanceMeters: 320, location: { lng: 111.29, lat: 30.69 } },
      { id: 'food-2', name: '宜昌凉虾店', district: '伍家岗区', address: '胜利四路', averageCost: 18, rating: 4.5, category: '餐饮服务;小吃', recommendationReason: '预算友好', nearestRoutePoint: { name: '宜昌博物馆' }, routeDistanceMeters: 480, location: { lng: 111.34, lat: 30.67 } },
    ] } });
    if (url.includes('/api/ai/analyze')) return route.fulfill({ json: { data: { analysis: '路线按沿江方向串联地标、博物馆与公园，兼顾拍照、美食和两日节奏。' } } });
    if (url.includes('/api/ai/schedule')) return route.fulfill({ json: { data: { departureTime: '08:20', items: [
      { id: 'bridge', day: 1, arrivalTime: '09:00', reason: '上午光线适合拍照' },
      { id: 'museum', day: 1, arrivalTime: '11:00', reason: '中午前完成室内参观' },
      { id: 'riverside', day: 2, arrivalTime: '17:00', reason: '傍晚沿江散步' },
    ], safetyNotes: ['沿江注意安全，不进入封闭区域'] } } });
    if (url.includes('/api/route/plan')) return route.fulfill({ json: { paths: [{ durationMinutes: 22, distanceKm: 6.8, polyline: [[111.307, 30.664], [111.349, 30.669], [111.285, 30.695]], steps: [] }] } });
    if (url.includes('/api/transit/plan')) return route.fulfill({ status: 503, json: { error: 'audit uses the built-in transport fallback' } });
    return route.fulfill({ status: 503, json: { error: 'mobile audit fallback' } });
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function createMobilePlan(page: Page, navigate = true) {
  if (navigate) {
    await page.goto('/#/planner');
    await page.waitForLoadState('networkidle');
  }
  const prompt = page.getByLabel('你想怎样游湖北？');
  await prompt.fill('宜昌两天一夜，预算600元，喜欢拍照和美食，不吃辣');
  await page.getByRole('button', { name: '识别这句话' }).click();
  await expect(page.getByText('城市：宜昌')).toBeVisible();
  await page.getByRole('button', { name: /生成我的.*行程/ }).click();
  try {
    await expect(page.getByRole('region', { name: '路线地图' })).toBeVisible({ timeout: 30_000 });
  } catch {
    throw new Error(`方案未生成：${(await page.locator('body').innerText()).slice(-500)}`);
  }
  await expect(page.getByRole('tab')).toHaveCount(7);
}

for (const viewport of mobileViewports) {
  test(`mobile ${viewport.name} keeps entry, map and all seven modules reachable`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockTravelServices(page);
    await createMobilePlan(page);
    await assertNoHorizontalOverflow(page);

    for (const label of ['概览', '路线', '行程记录', '天气', '交通', '美食', '预算']) {
      await page.getByRole('tab', { name: label }).click();
      await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
    }
    await page.screenshot({ path: `output/playwright/mobile-audit-${viewport.name}.png`, fullPage: false });
  });
}

test('mobile planner controls, sheet states and editable modules work end to end', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTravelServices(page);
  await page.goto('/#/planner');
  await page.getByPlaceholder('输入车站、酒店、道路或完整地址').fill('宜昌东站');
  await page.getByRole('button', { name: '确认手动出发地' }).click();
  await expect(page.getByRole('status').filter({ hasText: '手动起点已解析' })).toBeVisible();
  await page.getByLabel('出行人群').selectOption('情侣');
  await page.getByLabel('天数').fill('2');
  await page.getByLabel('预算（元）').fill('600');
  await page.getByLabel('开始日期').fill('2026-08-01');
  await page.getByLabel('结束日期').fill('2026-08-02');
  await page.getByRole('button', { name: '自然风光' }).click();
  await page.getByRole('button', { name: '不吃辣' }).click();
  await createMobilePlan(page, false);

  const grabber = page.getByRole('button', { name: '展开概览详情' });
  await grabber.click();
  await expect(page.getByRole('button', { name: '展开概览详情' })).toBeVisible();
  await grabber.click();
  await expect(page.getByRole('button', { name: '收起概览详情' })).toBeVisible();

  await page.getByLabel('总览计划预算').fill('720');
  await page.getByLabel('总览计划预算').press('Enter');
  await expect(page.getByLabel('总览计划预算')).toHaveValue('720');

  await page.getByRole('tab', { name: '路线' }).click();
  await expect(page.getByRole('heading', { name: '地点安排' })).toBeVisible();
  const arrangement = page.getByLabel('我的安排').first();
  await arrangement.fill('手机端编辑成功');
  await page.getByLabel('实际停留分钟').first().fill('35');
  await page.getByLabel('实际停留分钟').first().blur();

  await page.getByRole('tab', { name: '行程记录' }).click();
  const completeButton = page.getByRole('button', { name: /完成.+/ }).first();
  await completeButton.click();
  await expect(page.getByRole('button', { name: /取消完成.+/ }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('第1天手记').fill('手机行程手记已保存');

  await page.getByRole('tab', { name: '天气' }).click();
  await expect(page.getByText('接下来 8 小时')).toBeVisible();
  await page.getByRole('tab', { name: '交通' }).click();
  await expect(page.getByRole('heading', { name: '交通方案' })).toBeVisible();
  await page.getByRole('radio', { name: '驾车交通方式' }).click();
  await expect(page.getByRole('radio', { name: '驾车交通方式' })).toBeChecked();
  await page.getByRole('radio', { name: '公交 / 地铁交通方式' }).click();
  await expect(page.getByRole('radiogroup', { name: '公共交通路线偏好' })).toBeVisible();
  await page.getByRole('radio', { name: '时间短' }).click();

  await page.getByRole('tab', { name: '美食' }).click();
  await expect(page.getByText('峡州小馆')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /峡州小馆/ })).toHaveAttribute('href', /dianping|amap/);

  await page.getByRole('tab', { name: '预算' }).click();
  const amount = page.getByLabel('交通金额');
  await amount.fill('128');
  await amount.press('Enter');
  await page.getByRole('button', { name: /新增支出|新增预算条目/ }).click();
  await expect(page.getByLabel(/支出项目/)).toHaveCount(5);

  await page.getByRole('tab', { name: '路线' }).click();
  await expect(page.getByLabel('我的安排').first()).toHaveValue('手机端编辑成功');
  await page.getByRole('tab', { name: '行程记录' }).click();
  await expect(page.getByLabel('第1天手记')).toHaveValue('手机行程手记已保存');

  await page.getByRole('button', { name: '返回修改' }).click();
  await expect(page.getByRole('heading', { name: '懂你，也懂湖北' })).toBeVisible();
  await expect(page.getByLabel('预算（元）')).toHaveValue('720');
});

test('mobile home navigation, planning dialog and journal CRUD remain operable', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTravelServices(page);
  await page.goto('/#/');
  await page.getByRole('button', { name: '打开导航菜单' }).click();
  await expect(page.getByRole('button', { name: '关闭导航菜单' })).toBeVisible();
  await page.getByRole('button', { name: '关闭导航菜单' }).click();
  await page.getByRole('button', { name: '下一座城市' }).click();
  await expect(page.getByRole('heading', { name: '武汉' })).toBeVisible();
  await page.getByRole('button', { name: /以武汉开始规划|开始规划/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('首页规划天数').fill('3');
  await page.getByLabel('首页规划预算').fill('900');
  await page.getByRole('button', { name: /进入 AI 深度规划/ }).click();
  await expect(page).toHaveURL(/#\/planner$/);
  await expect(page.getByLabel('天数')).toHaveValue('3');
  await expect(page.getByLabel('预算（元）')).toHaveValue('900');

  await page.goto('/#/journal');
  await page.getByRole('button', { name: '记录行程景点' }).click();
  await expect(page.getByRole('complementary', { name: '新增旅行记录' })).toBeVisible();
  await page.getByLabel('AI 行程景点 *').fill('东湖听风');
  await page.getByLabel('手账心得').fill('手机端记录、保存和再次打开均正常。');
  await page.getByRole('button', { name: '保存这一页' }).click();
  await expect(page.getByRole('tab', { name: '已完成景点 1' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole('tab', { name: '已完成景点 1' })).toBeVisible();
  const journalEntryId = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('chuyou-app-state-v2') || 'null');
    return saved?.journalEntries?.[0]?.id as string | undefined;
  });
  expect(journalEntryId).toBeTruthy();
  await page.goto(`/#/journal/${journalEntryId}`);
  await expect(page.getByRole('heading', { name: '东湖听风' })).toBeVisible();
  await page.getByRole('button', { name: '编辑这一页' }).click();
  await page.getByLabel('手账心得').fill('手机端修改也已保存。');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('手机端修改也已保存。')).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
