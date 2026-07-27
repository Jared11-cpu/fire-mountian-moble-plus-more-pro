import { expect, test } from '@playwright/test';

test('homepage autoplay advances to the next city after five seconds', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '宜昌' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '武汉' })).toBeVisible({ timeout: 6_000 });
});

test('homepage opens on the cinematic city showcase and enters Planner on demand', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '宜昌' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '懂你，也懂湖北' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.getByRole('button', { name: '查看武汉' }).click();
  await expect(page.getByRole('heading', { name: '武汉' })).toBeVisible();
  await page.getByRole('button', { name: '下一座城市' }).click();
  await expect(page.getByRole('heading', { name: '恩施' })).toBeVisible();
  await page.getByRole('button', { name: '上一座城市' }).click();
  await expect(page.getByRole('heading', { name: '武汉' })).toBeVisible();
  await page.getByRole('button', { name: '暂停自动播放' }).click();
  await expect(page.getByRole('button', { name: '继续自动播放' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '继续自动播放' }).click();
  await expect(page.getByRole('button', { name: '暂停自动播放' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '以武汉开始规划' }).click();
  await expect(page).toHaveURL(/#\/planner$/);
  await expect(page.getByRole('heading', { name: '懂你，也懂湖北' })).toBeVisible();
  await expect(page.getByRole('button', { name: '生成我的武汉行程' })).toBeVisible();
});

test('mobile homepage keeps the immersive navigation and carousel operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await expect(page.getByLabel('当前城市编号 01')).toBeVisible();
  await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '宜昌' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.getByRole('button', { name: '下一座城市' }).click();
  await expect(page.getByRole('heading', { name: '武汉' })).toBeVisible();
  await expect(page.getByLabel('当前城市编号 02')).toBeVisible();
});

test('HashRouter direct refresh and browser history', async ({ page }) => {
  await page.goto('/#/planner');
  await expect(page.getByRole('heading', { name: '懂你，也懂湖北' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('开始日期')).toBeVisible();
  await page.getByRole('button', { name: '旅行手账' }).click();
  await expect(page).toHaveURL(/#\/journal$/);
  await expect(page.getByText('还没有真实记录，先在右侧写下第一站。')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/planner$/);
  await page.goto('/#/about');
  await page.reload();
  await expect(page.getByRole('heading', { name: '系统架构图' })).toBeVisible();
});

test('natural language acceptance case stays synchronized', async ({ page }) => {
  await page.goto('/#/planner');
  const prompt = page.getByLabel('用一句话描述旅行需求');
  await prompt.fill('恩施三天两夜，预算1000元，喜欢峡谷和拍照，不吃辣');
  await page.getByRole('button', { name: '识别条件' }).click();
  await expect(page.getByText('城市：恩施')).toBeVisible();
  await expect(page.getByText('天数：3天')).toBeVisible();
  await expect(page.getByText('预算：1000元')).toBeVisible();
  await expect(page.getByText('兴趣：自然风光')).toBeVisible();
  await expect(page.getByText('饮食限制：不吃辣')).toBeVisible();
  await expect(page.getByLabel('天数')).toHaveValue('3');
  await expect(page.getByLabel('预算（元）')).toHaveValue('1000');
});

test('edits survive detail tab switches and refresh', async ({ page }) => {
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await page.getByRole('button', { name: '行程记录' }).click();
  const note = page.getByLabel('第1天手记');
  await note.fill('切换标签后必须保留');
  await page.getByRole('button', { name: '天气' }).click();
  await page.getByRole('button', { name: '行程记录' }).click();
  await expect(page.getByLabel('第1天手记')).toHaveValue('切换标签后必须保留');
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('button', { name: '行程记录' }).click();
  await expect(page.getByLabel('第1天手记')).toHaveValue('切换标签后必须保留');
});

test('journal uses a 7:3 map spread and opens a durable A4 detail page', async ({ page }) => {
  await page.goto('/#/journal');
  const mapPaper = page.getByRole('region', { name: '旅行手账地图' });
  const form = page.getByRole('region', { name: '新增旅行记录' });
  const mapBox = await mapPaper.boundingBox();
  const formBox = await form.boundingBox();
  expect((mapBox?.width ?? 0) / (formBox?.width ?? 1)).toBeGreaterThan(1.8);

  await page.getByLabel('地点 *').fill('东湖听风');
  await page.getByLabel('手账心得（与照片至少填一项）').fill('湖面有风，傍晚的树影像慢慢翻过去的一页。');
  await page.getByRole('button', { name: '保存这一页' }).click();
  await expect(page.getByRole('tab', { name: '真实足迹 1' })).toBeVisible();
  await page.getByRole('button', { name: /东湖听风/ }).click();
  await expect(page).toHaveURL(/#\/journal\/.+/);
  await expect(page.getByRole('heading', { name: '东湖听风' })).toBeVisible();
  await expect(page.getByText('湖面有风，傍晚的树影像慢慢翻过去的一页。')).toBeVisible();
  await expect(page.getByText('也感谢认真记录当下的自己。')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '东湖听风' })).toBeVisible();
});

test('overview metrics are directly editable and persist', async ({ page }) => {
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await expect(page.getByText('当前为规则引擎生成演示', { exact: false })).toHaveCount(0);
  await expect(page.getByText('RULES-BASED TRAVEL PLANNER', { exact: true })).toHaveCount(0);
  await expect(page.getByText('已根据当前确认参数生成规则路线。', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '分享' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '地图行程摘要' })).toBeVisible();
  await expect(page.getByText('道路结果不可用', { exact: true })).toHaveCount(0);

  await page.getByLabel('总览点位').fill('4');
  await page.getByLabel('总览点位').press('Enter');
  await page.getByLabel('总览预计时长').fill('6.5');
  await page.getByLabel('总览预计时长').press('Enter');
  await page.getByLabel('总览预算总计').fill('750');
  await page.getByLabel('总览预算总计').press('Enter');
  await page.getByLabel('总览出发日期').fill('2026-08-01');
  await page.getByLabel('总览出发时间').fill('07:20');
  await expect(page.getByRole('region', { name: '总览出发安排' })).toBeVisible();
  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.getByLabel('总览点位')).toHaveValue('4');
  await expect(page.getByLabel('总览预计时长')).toHaveValue('6.5');
  await expect(page.getByLabel('总览预算总计')).toHaveValue('750');
  await expect(page.getByLabel('总览出发日期')).toHaveValue('2026-08-01');
  await expect(page.getByLabel('总览出发时间')).toHaveValue('07:20');
});

test('route detail keeps map fixed and saves expanded place arrangements', async ({ page }) => {
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await expect(page.getByText('已保存方案 · 自动同步')).toBeVisible();
  await page.getByRole('button', { name: '路线' }).click();
  await expect(page.getByText('已保存方案 · 自动同步')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '地点安排' })).toBeVisible();

  const map = page.getByRole('region', { name: '路线地图' });
  const initialHeight = (await map.boundingBox())?.height;
  await expect(page.getByAltText('宜昌东站地点照片')).toBeVisible();
  await expect(page.getByText('我的地点安排')).toBeVisible();
  await page.getByLabel('我的安排').fill('提前十分钟到达，先拍站牌再集合。');
  await page.getByLabel('停留分钟').fill('25');
  await page.getByLabel('停留分钟').blur();
  await page.getByLabel('方案详情', { exact: true }).evaluate((element) => { const scroller = element.querySelector('[class*="overflow-y-auto"]'); if (scroller) scroller.scrollTop = scroller.scrollHeight; });
  expect((await map.boundingBox())?.height).toBe(initialHeight);

  await page.getByRole('button', { name: '概览' }).click();
  await page.getByRole('button', { name: '路线' }).click();
  await expect(page.getByLabel('我的安排')).toHaveValue('提前十分钟到达，先拍站牌再集合。');
  await expect(page.getByLabel('停留分钟')).toHaveValue('25');
});

test('daily paper tasks can be completed and edited persistently', async ({ page }) => {
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await page.getByRole('button', { name: '行程记录' }).click();
  await expect(page.getByText('已保存方案 · 自动同步')).toHaveCount(0);
  await page.getByRole('button', { name: '完成宜昌东站' }).click();
  await expect(page.getByRole('button', { name: '取消完成宜昌东站' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '编辑宜昌东站' }).click();
  await page.getByLabel('修改宜昌东站时间').fill('09:05');
  await page.getByLabel('修改宜昌东站任务').fill('宜昌东站集合');
  await page.getByRole('button', { name: '完成编辑宜昌东站集合' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('button', { name: '行程记录' }).click();
  const completedTask = page.getByRole('button', { name: '取消完成宜昌东站集合' });
  await expect(completedTask).toBeVisible();
  await expect(completedTask).toContainText('09:05');
});

test('weather turns source data into practical itinerary advice', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', async (route) => route.fulfill({ json: {
    current: { time: '2026-07-14T10:00', temperature_2m: 34.2, apparent_temperature: 38.1, relative_humidity_2m: 82, precipitation: 0, weather_code: 1, wind_speed_10m: 15, wind_gusts_10m: 27 },
    hourly: { time: Array.from({ length: 10 }, (_, index) => `2026-07-14T${String(10 + index).padStart(2, '0')}:00`), temperature_2m: [34, 35, 36, 36, 35, 34, 33, 32, 31, 30], precipitation_probability: [20, 30, 50, 70, 65, 45, 30, 20, 10, 10], weather_code: [1, 1, 2, 80, 80, 61, 3, 2, 1, 1] },
    daily: { time: ['2026-07-14', '2026-07-15', '2026-07-16'], weather_code: [80, 3, 1], temperature_2m_max: [36, 33, 32], temperature_2m_min: [27, 26, 25], precipitation_probability_max: [70, 30, 10], sunrise: ['2026-07-14T05:40', '2026-07-15T05:41', '2026-07-16T05:41'], sunset: ['2026-07-14T19:38', '2026-07-15T19:38', '2026-07-16T19:37'], uv_index_max: [8.2, 6.4, 5.1] },
  } }));
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await page.getByRole('button', { name: '天气' }).click();
  await expect(page.getByText('体感 38°')).toBeVisible();
  await expect(page.getByText('降雨概率', { exact: true })).toBeVisible();
  await expect(page.getByText('防暑优先', { exact: false })).toBeVisible();
  await expect(page.getByText('紫外线指数最高 8.2', { exact: false })).toBeVisible();
  await expect(page.getByText('接下来 8 小时')).toBeVisible();
  await expect(page.getByText('日出')).toBeVisible();
  await expect(page.getByText('Open‑Meteo Weather Forecast API')).toBeVisible();
});

test('transport adapter renders a truthful segmented smart plan', async ({ page }) => {
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await page.getByRole('tab', { name: '交通' }).click();
  await expect(page.getByRole('heading', { name: '公共交通路书' })).toBeVisible();
  await expect(page.getByText('规则引擎交通方案')).toBeVisible();
  await expect(page.getByText('规则估算', { exact: true })).toBeVisible();
  await expect(page.getByText('第 1 段', { exact: false })).toBeVisible();
  await expect(page.getByText('动态公交代理', { exact: false })).toBeVisible();
});

test('budget accepts direct amounts, persists, and scrolls without resizing the map', async ({ page }) => {
  await page.goto('/#/planner');
  await page.getByRole('button', { name: '规则引擎生成演示' }).click();
  await page.getByRole('button', { name: '预算' }).click();
  const map = page.getByRole('region', { name: '路线地图' });
  const initialHeight = (await map.boundingBox())?.height;
  const amount = page.getByLabel('交通金额');
  await amount.fill('135');
  await amount.press('Enter');
  await page.getByLabel('交通备注').fill('含往返接驳费用');
  for (let index = 0; index < 8; index += 1) await page.getByRole('button', { name: '新增预算条目' }).click();
  await page.getByLabel('方案详情', { exact: true }).evaluate((element) => { const scroller = element.querySelector('[class*="overflow-y-auto"]'); if (scroller) scroller.scrollTop = scroller.scrollHeight; });
  expect((await map.boundingBox())?.height).toBe(initialHeight);
  await page.waitForTimeout(700);
  await page.reload();
  await page.getByRole('button', { name: '预算' }).click();
  await expect(page.getByLabel('交通金额')).toHaveValue('135');
  await expect(page.getByLabel('交通备注')).toHaveValue('含往返接驳费用');
  await expect(page.getByText('12 项')).toBeVisible();
});

