/**
 * 百度贴吧图文发布模块
 * 方式：Playwright 模拟贴吧发帖 UI 操作
 *
 * 反封号措施：
 *   - playwright-extra + stealth 插件隐藏 webdriver 指纹
 *   - launchPersistentContext 持久化 profile
 *   - 首次使用需手动登录（等待 120 秒），之后 session 自动复用
 *
 * 关键交互点（2026年5月）：
 *   - 发帖页：https://tieba.baidu.com/post/submit（通用发帖页）
 *   - 标题输入框：input[name="title"] 或 input[placeholder*="标题"]
 *   - 内容输入框：[contenteditable="true"] 或 textarea
 *   - 图片上传：工具栏图片按钮，触发 input[type="file"]
 *   - 发布按钮：button:has-text("发帖") 或 input[type="submit"]
 *   - 需要指定贴吧名称（kw 参数），默认发到「跨境电商」吧
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies } from '../utils/cookie.js';

chromium.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'profiles', 'tieba');
const TIEBA_URL = 'https://tieba.baidu.com';
// 默认发帖的贴吧（跨境电商相关）
const DEFAULT_BAR = '跨境电商';

export async function publish({ title, desc, images }) {
  console.log('[贴吧] 开始发帖...');

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
  const savedCookies = loadCookies('tieba');
  if (savedCookies && savedCookies.length > 0) {
    await context.addCookies(savedCookies);
    console.log('[贴吧] 已注入登录 Cookie');
  }

  const page = await context.newPage();

  try {
    // 1. 打开贴吧首页
    console.log('[贴吧] 打开贴吧首页...');
    await page.goto(TIEBA_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 检测是否需要登录
    if (page.url().includes('login') || page.url().includes('passport')) {
      console.log('[贴吧] 检测到未登录，请手动扫码/输入账号密码登录...');
      console.log('[贴吧] 等待 120 秒供手动登录...');
      await page.waitForFunction(
        () => window.location.href.includes('tieba.baidu.com') && !window.location.href.includes('login'),
        { timeout: 120000 }
      );
      await page.waitForTimeout(2000);
      console.log('[贴吧] 登录完成...');
    }

    // 2. 进入目标贴吧并点击「发帖」
    console.log(`[贴吧] 进入 ${DEFAULT_BAR} 吧...`);
    const barUrl = `${TIEBA_URL}/f?kw=${encodeURIComponent(DEFAULT_BAR)}`;
    await page.goto(barUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 点击「+ 发帖」按钮
    // 优先用选择器，fallback 用截图确认的坐标（顶部导航栏右侧蓝色按钮）
    try {
      const postBtn = page.locator('a:has-text("发帖"), button:has-text("发帖"), [class*="publish"]').first();
      await postBtn.waitFor({ timeout: 5000 });
      await postBtn.click();
    } catch {
      console.log('[贴吧] 尝试坐标点击发帖按钮...');
      await page.mouse.click(945, 29); // 顶部「+ 发帖」按钮
    }
    await page.waitForTimeout(2000);

    // 3. 填写标题
    console.log('[贴吧] 填写标题...');
    if (title) {
      const titleInput = page.locator('input[name="title"], input[placeholder*="标题"]').first();
      await titleInput.waitFor({ timeout: 10000 });
      await titleInput.click();
      await titleInput.fill(title);
      await page.waitForTimeout(300);
    }

    // 4. 填写正文
    console.log('[贴吧] 填写正文...');
    if (desc) {
      // 贴吧编辑器可能是 contenteditable 或 textarea
      const editor = page.locator('[contenteditable="true"], textarea[name="content"]').first();
      await editor.waitFor({ timeout: 10000 });
      await editor.click();
      await page.waitForTimeout(300);
      await page.keyboard.type(desc, { delay: 20 });
      console.log('[贴吧] 已填入正文');
      await page.waitForTimeout(500);
    }

    // 5. 上传图片
    if (images && images.length > 0) {
      console.log(`[贴吧] 上传 ${images.length} 张图片...`);
      const absPaths = images.map(p => path.resolve(p));

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        page.locator('[title*="图片"], [aria-label*="图片"], [class*="upload"], [class*="img-btn"]').first().click(),
      ]);
      await fileChooser.setFiles(absPaths);
      console.log('[贴吧] 等待图片处理...');
      await page.waitForTimeout(5000);
    }

    // 6. 点击发帖按钮
    console.log('[贴吧] 点击发帖按钮...');
    await page.waitForTimeout(1000);

    const submitBtn = page.locator('button:has-text("发帖"), input[value="发帖"], button:has-text("提交")').first();
    await submitBtn.waitFor({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(3000);

    console.log('[贴吧] 已点击发帖按钮');

    // 7. 检测发布结果（成功后跳转到帖子页）
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    const toast = await page.locator('[class*="toast"], [class*="tips"], [class*="error"]').first()
      .textContent({ timeout: 3000 }).catch(() => '');
    if (toast) console.log(`[贴吧] 提示: ${toast}`);

    if (currentUrl.includes('/p/') || !currentUrl.includes('submit')) {
      console.log(`[贴吧] 发帖成功！跳转到: ${currentUrl}`);
    } else {
      console.log('[贴吧] 发帖完成（请到贴吧确认）');
    }
    return { success: true, platform: 'tieba' };

  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}
