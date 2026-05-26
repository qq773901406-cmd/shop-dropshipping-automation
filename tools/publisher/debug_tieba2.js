/**
 * 贴吧发帖编辑器调试 - 截图并找输入框
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies } from './utils/cookie.js';

chromium.use(StealthPlugin());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, 'profiles', 'tieba');

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

const savedCookies = loadCookies('tieba');
if (savedCookies) await context.addCookies(savedCookies);

const page = await context.newPage();
await page.goto('https://tieba.baidu.com/f?kw=%E8%B7%A8%E5%A2%83%E7%94%B5%E5%95%86', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

// 点击发帖
try {
  await page.locator('a:has-text("发帖"), button:has-text("发帖"), [class*="publish"]').first().click({ timeout: 5000 });
} catch {
  await page.mouse.click(945, 29);
}
await page.waitForTimeout(3000);

// 截图
await page.screenshot({ path: path.join(__dirname, 'debug_tieba_editor.png'), fullPage: false });
console.log('截图保存: debug_tieba_editor.png');
console.log('当前 URL:', page.url());

// 找所有输入框
const inputs = await page.evaluate(() => {
  return [...document.querySelectorAll('input, textarea, [contenteditable]')].map(el => ({
    tag: el.tagName,
    type: el.type,
    name: el.name,
    placeholder: el.placeholder,
    className: (el.className || '').slice(0, 60),
    contenteditable: el.getAttribute('contenteditable'),
    display: window.getComputedStyle(el).display,
    visibility: window.getComputedStyle(el).visibility,
  }));
});
console.log('\n所有输入框：');
inputs.forEach(e => console.log(`  [${e.tag}] type="${e.type}" name="${e.name}" placeholder="${e.placeholder}" class="${e.className}" display="${e.display}"`));

await context.close();
