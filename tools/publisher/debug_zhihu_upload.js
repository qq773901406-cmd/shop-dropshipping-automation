/**
 * 调试：图片上传后的弹窗状态
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
if (savedCookies?.length > 0) await context.addCookies(savedCookies);

const page = await context.newPage();
await page.goto('https://www.zhihu.com/creator', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

// 关弹窗
try {
  await page.locator('button[aria-label="关闭"], .Modal-closeButton, [class*="closeButton"]').first().waitFor({ timeout: 3000 });
  await page.locator('button[aria-label="关闭"], .Modal-closeButton, [class*="closeButton"]').first().click();
  await page.waitForTimeout(1000);
} catch {}
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 点发想法
await page.locator('button:has-text("发想法")').first().waitFor({ timeout: 10000 });
await page.locator('button:has-text("发想法")').first().click();
await page.waitForTimeout(2000);

// 输入文字
const editor = page.locator('[contenteditable="true"]').first();
await editor.waitFor({ timeout: 10000 });
await editor.click();
await page.keyboard.type('测试', { delay: 20 });
await page.waitForTimeout(500);

// 点图片按钮（工具栏第3个）
const toolbarBtns = page.locator('.WritePinToolbar button.Button--plain');
await toolbarBtns.nth(2).click();
await page.waitForTimeout(500);

// 上传1张图片测试
const imgPath = 'D:/Product/image.png';
await page.evaluate(() => {
  const inp = document.querySelector('input[type="file"]');
  if (inp) inp.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;width:1px;height:1px;position:fixed;top:0;left:0;';
});
await page.waitForTimeout(300);
await page.locator('input[type="file"]').first().setInputFiles(imgPath);
console.log('图片已设置，等待10秒...');
await page.waitForTimeout(10000);

// 截图看状态
await page.screenshot({ path: 'D:/Product/debug_after_upload.png', fullPage: false });
console.log('截图已保存: D:/Product/debug_after_upload.png');

// 输出弹窗/遮罩信息
const modals = await page.evaluate(() => {
  const els = document.querySelectorAll('.Modal-backdrop, [class*="modal"], [class*="Modal"], [class*="backdrop"]');
  return Array.from(els).map(el => ({
    class: el.className,
    display: window.getComputedStyle(el).display,
    children_btns: Array.from(el.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim().substring(0, 40),
      class: b.className.substring(0, 60),
    }))
  }));
});
console.log('弹窗/遮罩信息:');
console.log(JSON.stringify(modals, null, 2));

await page.waitForTimeout(3000);
await context.close();
