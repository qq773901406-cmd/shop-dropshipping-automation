/**
 * 调试：知乎「发想法」编辑器图片上传区域
 * 1. 打开创作者中心
 * 2. 点击「发想法」
 * 3. 输入少量文字
 * 4. 截图 + 输出所有 input[type=file] 信息 + 工具栏按钮信息
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies } from './utils/cookie.js';

chromium.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, 'profiles', 'zhihu');

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

const savedCookies = loadCookies('zhihu');
if (savedCookies && savedCookies.length > 0) {
  await context.addCookies(savedCookies);
}

const page = await context.newPage();
await page.goto('https://www.zhihu.com/creator', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

// 关闭弹窗
try {
  const closeBtn = page.locator('button[aria-label="关闭"], .Modal-closeButton, [class*="closeButton"]').first();
  await closeBtn.waitFor({ timeout: 3000 });
  await closeBtn.click();
  await page.waitForTimeout(1000);
} catch {}
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 点击「发想法」
const pinBtn = page.locator('button:has-text("发想法")').first();
await pinBtn.waitFor({ timeout: 10000 });
await pinBtn.click();
await page.waitForTimeout(2000);

// 输入少量文字触发编辑器激活
const editor = page.locator('[contenteditable="true"]').first();
await editor.waitFor({ timeout: 10000 });
await editor.click();
await page.keyboard.type('测试文字', { delay: 50 });
await page.waitForTimeout(1000);

// 截图
await page.screenshot({ path: 'debug_zhihu_img_editor.png', fullPage: false });
console.log('截图已保存: debug_zhihu_img_editor.png');

// 输出工具栏信息
const toolbar = await page.evaluate(() => {
  const bars = document.querySelectorAll('[class*="Toolbar"], [class*="toolbar"]');
  return Array.from(bars).map(b => ({
    class: b.className,
    buttons: Array.from(b.querySelectorAll('button, span[role="button"], div[role="button"]')).map(btn => ({
      tag: btn.tagName,
      class: btn.className,
      title: btn.title || btn.getAttribute('aria-label') || '',
      text: btn.textContent?.trim().substring(0, 30),
    }))
  }));
});
console.log('工具栏信息:');
console.log(JSON.stringify(toolbar, null, 2));

// 输出所有 input[type=file]
const inputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input[type="file"]')).map(inp => ({
    accept: inp.accept,
    display: window.getComputedStyle(inp).display,
    visibility: window.getComputedStyle(inp).visibility,
    multiple: inp.multiple,
    id: inp.id,
    name: inp.name,
    class: inp.className,
    parentClass: inp.parentElement?.className,
  }));
});
console.log('\ninput[type=file] 信息:');
console.log(JSON.stringify(inputs, null, 2));

await page.waitForTimeout(3000);
await context.close();
