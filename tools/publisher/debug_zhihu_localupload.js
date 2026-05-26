/**
 * 调试：点击「本地图片上传」后的行为
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
await page.waitForTimeout(1000);

// 截图弹窗
await page.screenshot({ path: 'D:/Product/debug_modal1.png' });
console.log('截图1已保存（弹窗）');

// 找「本地图片上传」按钮
const localBtn = page.locator('.css-1dwe63b').first();
console.log('等待本地上传按钮...');
await localBtn.waitFor({ timeout: 5000 });

// 同时监听 filechooser 事件
const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
  localBtn.click(),
]);

if (fileChooser) {
  console.log('触发了 filechooser！用 fileChooser 设置文件');
  await fileChooser.setFiles('D:/Product/image.png');
} else {
  console.log('没有触发 filechooser，尝试找 input[type=file]');
  await page.waitForTimeout(500);
  // 截图
  await page.screenshot({ path: 'D:/Product/debug_modal2.png' });
  console.log('截图2已保存');
  
  // 输出所有input[type=file]
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="file"]')).map(inp => ({
      display: window.getComputedStyle(inp).display,
      parentClass: inp.parentElement?.className,
    }));
  });
  console.log('inputs:', JSON.stringify(inputs));
  
  // 强制显示并设置
  await page.evaluate(() => {
    document.querySelectorAll('input[type="file"]').forEach(inp => {
      inp.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;width:1px;height:1px;position:fixed;top:0;left:0;';
    });
  });
  await page.waitForTimeout(300);
  await page.locator('input[type="file"]').first().setInputFiles('D:/Product/image.png');
}

console.log('等待10秒看上传结果...');
await page.waitForTimeout(10000);
await page.screenshot({ path: 'D:/Product/debug_after_local_upload.png' });
console.log('截图3已保存: debug_after_local_upload.png');

await context.close();
