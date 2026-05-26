/**
 * 调试：图片上传后「插入图片」弹窗
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
await page.locator('[contenteditable="true"]').first().waitFor({ timeout: 10000 });
await page.locator('[contenteditable="true"]').first().click();
await page.keyboard.type('测试', { delay: 20 });
await page.waitForTimeout(500);

// 点图片按钮（工具栏第3个）
await page.locator('.WritePinToolbar button.Button--plain').nth(2).click();
await page.waitForTimeout(1000);

// 点「本地图片上传」
await page.locator('.css-1dwe63b').first().waitFor({ timeout: 5000 });
await page.locator('.css-1dwe63b').first().click();
await page.waitForTimeout(500);

// 强制显示所有 input[type=file]，用第2个（弹窗内）
await page.evaluate(() => {
  document.querySelectorAll('input[type="file"]').forEach(inp => {
    inp.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;width:1px;height:1px;position:fixed;top:0;left:0;';
  });
});
await page.waitForTimeout(300);
const allInputs = page.locator('input[type="file"]');
const inputCount = await allInputs.count();
const targetInput = inputCount >= 2 ? allInputs.nth(1) : allInputs.first();
await targetInput.setInputFiles('D:/Product/image.png');

console.log('图片已设置，等待上传+弹窗出现（15秒）...');
await page.waitForTimeout(15000);

// 截图看「插入图片」弹窗
await page.screenshot({ path: 'D:/Product/debug_insert_dialog.png', fullPage: false });
console.log('截图已保存: debug_insert_dialog.png');

// 输出所有按钮文字
const allBtns = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button')).map(b => ({
    text: b.textContent?.trim().substring(0, 40),
    class: b.className.substring(0, 80),
    visible: window.getComputedStyle(b).display !== 'none',
  })).filter(b => b.text);
});
console.log('所有可见按钮:');
console.log(JSON.stringify(allBtns.filter(b => b.visible), null, 2));

await page.waitForTimeout(3000);
await context.close();
