import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const artifacts = resolve('artifacts/planner-showcase');
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await desktop.goto('http://127.0.0.1:4173/#/planner', { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: 'YICHANG' }).waitFor();
await desktop.screenshot({ path: resolve(artifacts, 'desktop-hero.png') });
await desktop.getByRole('button', { name: '查看武汉' }).click();
await desktop.getByRole('heading', { name: 'WUHAN' }).waitFor();
await desktop.getByRole('button', { name: '江城漫步' }).click();
if (await desktop.getByRole('button', { name: '江城漫步' }).getAttribute('aria-pressed') !== 'true') throw new Error('Interest sync failed');
await desktop.getByRole('button', { name: '以武汉开始规划' }).click();
await desktop.locator('#planner-ai-entry').scrollIntoViewIfNeeded();
await desktop.waitForTimeout(1200);
await desktop.getByRole('heading', { name: '懂你，也懂湖北' }).waitFor();
const navState = await desktop.evaluate(() => ({ scrollY, hero: document.querySelector('[data-city-showcase]')?.getBoundingClientRect().toJSON(), className: document.querySelector('.immersive-header')?.className }));
console.log('NAV_STATE', JSON.stringify(navState));
if (!String(navState.className).includes('is-scrolled')) throw new Error('Header did not switch after hero');
await desktop.locator('.planner-more-conditions summary').click();
await desktop.getByLabel('预算（元）').waitFor({ state: 'visible' });
await desktop.screenshot({ path: resolve(artifacts, 'desktop-ai-entry.png') });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await mobile.goto('http://127.0.0.1:4173/#/planner', { waitUntil: 'networkidle' });
await mobile.getByRole('heading', { name: 'WUHAN' }).waitFor();
await mobile.screenshot({ path: resolve(artifacts, 'mobile-hero.png') });
await mobile.getByRole('button', { name: '打开导航菜单' }).click();
await mobile.screenshot({ path: resolve(artifacts, 'mobile-menu.png') });

if (errors.length) throw new Error(`Browser console errors: ${errors.join(' | ')}`);
console.log('QA_OK desktop_carousel interest_sync scroll_nav details mobile_nav');
console.log(artifacts);
await browser.close();
