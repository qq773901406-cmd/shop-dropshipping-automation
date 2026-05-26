/**
 * 知乎图文发布模块
 * 方式：Playwright 模拟知乎创作者中心发布「想法」（支持图片+文字）
 *
 * 反封号措施：
 *   - playwright-extra + stealth 插件隐藏 webdriver 指纹
 *   - launchPersistentContext 持久化 profile
 *   - 首次使用需手动登录（等待 120 秒），之后 session 自动复用
 *
 * 关键交互点（2026年5月）：
 *   - 创作者中心：https://www.zhihu.com/creator
 *   - 发布「想法」入口：创作者中心顶部「发想法」按钮
 *   - 内容输入框：[contenteditable="true"]（富文本编辑器）
 *   - 图片上传：工具栏图片图标，触发 input[type="file"]
 *   - 发布按钮：button:has-text("发布")
 *   - 知乎无独立标题，title + desc 合并写入正文
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies } from '../utils/cookie.js';

chromium.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'profiles', 'zhihu');
const CREATOR_URL = 'https://www.zhihu.com/creator';

export async function publish({ title, desc, images }) {
  console.log('[知乎] 开始发布想法...');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  // 注入已保存的登录 Cookie
  const savedCookies = loadCookies('zhihu');
  if (savedCookies && savedCookies.length > 0) {
    await context.addCookies(savedCookies);
    console.log('[知乎] 已注入登录 Cookie');
  }

  const page = await context.newPage();

  try {
    // 1. 打开知乎创作者中心
    console.log('[知乎] 打开创作者中心...');
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 检测是否需要登录
    if (page.url().includes('login') || page.url().includes('passport') || !page.url().includes('zhihu.com')) {
      console.log('[知乎] 检测到未登录，请手动扫码/输入账号密码登录...');
      console.log('[知乎] 等待 120 秒供手动登录...');
      await page.waitForFunction(
        () => window.location.href.includes('zhihu.com') && !window.location.href.includes('login'),
        { timeout: 120000 }
      );
      await page.waitForTimeout(2000);
      console.log('[知乎] 登录完成，跳转到创作者中心...');
      await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
    }

    // 2. 关闭可能出现的弹窗（活动弹窗等）
    try {
      const closeBtn = page.locator('button[aria-label="关闭"], .Modal-closeButton, [class*="closeButton"], [class*="close-btn"], svg[aria-label="关闭"]').first();
      await closeBtn.waitFor({ timeout: 3000 });
      await closeBtn.click();
      console.log('[知乎] 已关闭弹窗');
      await page.waitForTimeout(1000);
    } catch {
      // 没有弹窗，继续
    }
    // 也尝试按 Escape 关闭弹窗
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 3. 点击「发想法」按钮
    console.log('[知乎] 点击发想法按钮...');
    const pinBtn = page.locator('button:has-text("发想法")').first();
    await pinBtn.waitFor({ timeout: 10000 });
    await pinBtn.click();
    await page.waitForTimeout(2000);

    // 3. 填写正文（title + desc 合并，知乎想法无独立标题）
    console.log('[知乎] 填写正文...');
    const content = [title, desc].filter(Boolean).join('\n\n');
    if (content) {
      const editor = page.locator('[contenteditable="true"]').first();
      await editor.waitFor({ timeout: 10000 });
      await editor.click();
      await page.waitForTimeout(300);
      await page.keyboard.type(content, { delay: 20 });
      console.log('[知乎] 已填入正文');
      await page.waitForTimeout(500);
    }

    // 4. 上传图片
    if (images && images.length > 0) {
      console.log(`[知乎] 上传 ${images.length} 张图片...`);
      const absPaths = images.map(p => path.resolve(p));

      // 工具栏第3个按钮（index 2）是图片按钮，点击后弹出上传选择弹窗
      const toolbarBtns = page.locator('.WritePinToolbar button.Button--plain');
      const btnCount = await toolbarBtns.count();
      console.log(`[知乎] 工具栏按钮数量: ${btnCount}`);
      if (btnCount >= 3) {
        await toolbarBtns.nth(2).click();
        await page.waitForTimeout(1000);
      }

      // 等待上传选择弹窗出现，点击「本地图片上传」图标（第一个按钮 .css-1dwe63b）
      console.log('[知乎] 等待上传弹窗...');
      const localUploadBtn = page.locator('.css-1dwe63b').first();
      await localUploadBtn.waitFor({ timeout: 5000 });
      await localUploadBtn.click();
      await page.waitForTimeout(500);

      // 弹窗内的 input[type=file] 是第2个（parentClass: css-1lx7oj）
      // 强制所有 input[type=file] 可见，然后设置文件
      await page.evaluate(() => {
        document.querySelectorAll('input[type="file"]').forEach(inp => {
          inp.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;width:1px;height:1px;position:fixed;top:0;left:0;';
        });
      });
      await page.waitForTimeout(300);

      // 使用弹窗内的 input（第2个），accept 包含 image/
      const allInputs = page.locator('input[type="file"]');
      const inputCount = await allInputs.count();
      console.log(`[知乎] 找到 ${inputCount} 个 input[type=file]`);
      // 优先用弹窗内的（index 1），若只有1个则用第0个
      const targetInput = inputCount >= 2 ? allInputs.nth(1) : allInputs.first();
      await targetInput.setInputFiles(absPaths);
      console.log('[知乎] 图片文件已设置，等待上传完成...');
      // 9张图片需要更长等待时间
      await page.waitForTimeout(20000);
      console.log('[知乎] 图片上传等待完成');

      // 点击「插入图片」按钮确认插入
      console.log('[知乎] 点击「插入图片」按钮...');
      const insertBtn = page.locator('.css-owamhi, button:has-text("插入图片")').first();
      await insertBtn.waitFor({ timeout: 10000 });
      await insertBtn.click();
      console.log('[知乎] 图片已插入编辑器');
      await page.waitForTimeout(2000);
    }

    // 5. 点击发布按钮
    console.log('[知乎] 点击发布按钮...');
    await page.waitForTimeout(1000);

    // 知乎想法发布按钮是工具栏右边的蓝色「发布」按钮
    const publishBtn = page.locator('.WritePinToolbar button.Button--blue, button:has-text("发布")').first();
    await publishBtn.waitFor({ timeout: 10000 });
    await publishBtn.click();
    await page.waitForTimeout(3000);

    console.log('[知乎] 已点击发布按钮');

    // 6. 检测发布结果
    await page.waitForTimeout(3000);
    const toast = await page.locator('[class*="toast"], [class*="Toast"], [class*="message"]').first()
      .textContent({ timeout: 3000 }).catch(() => '');
    if (toast) console.log(`[知乎] 提示: ${toast}`);

    console.log('[知乎] 发布完成（请到知乎创作者中心确认）');
    return { success: true, platform: 'zhihu' };

  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}
