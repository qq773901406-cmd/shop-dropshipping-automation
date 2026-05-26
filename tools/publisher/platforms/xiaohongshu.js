/**
 * 小红书图文发布模块
 * 方式：Playwright 模拟创作者后台 UI 操作
 *
 * 反封号升级（方案A）：
 *   - 用 playwright-extra + stealth 插件隐藏 webdriver 指纹
 *   - 用 launchPersistentContext 持久化 profile，同账号始终"同一台设备"
 *   - 不再每次新建浏览器实例 + 注入 Cookie，避免"频繁换设备"风控
 *   - 首次使用需手动登录（等待 120 秒），之后 session 自动复用
 *
 * 关键交互点（2025年5月）：
 *   - 发布页：https://creator.xiaohongshu.com/publish/publish?source=official
 *   - 默认是"上传视频"tab，需要切换到"上传图文"
 *   - 切换tab：DOM中有多个 .creator-tab，用 page.evaluate 触发 JS click
 *   - 上传图文tab激活后，会出现 input[type="file"]，可直接 setInputFiles
 *   - 标题输入框：input[placeholder*="标题"]
 *   - 描述输入框：[contenteditable="true"]（富文本编辑器）
 *   - 发布按钮：底部固定操作区（position:fixed）
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// 注入 stealth 插件：隐藏 webdriver=true 等自动化特征
chromium.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CREATOR_URL = 'https://creator.xiaohongshu.com';
// 持久化 profile 路径（同账号始终用同一目录 = 同一"设备"）
const PROFILE_DIR = path.join(__dirname, '..', 'profiles', 'xiaohongshu');

export async function publish({ title, desc, images }) {
  console.log('[小红书] 开始发布图文...');

  // 用持久化 context 替代 chromium.launch() + newContext() + addCookies()
  // 这样每次启动都是同一个"设备"，不触发"频繁换设备"风控
  console.log('[小红书] 检测到已有 profile，直接复用 session');
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

  const page = await context.newPage();

  try {
    // 1. 打开发布页
    console.log('[小红书] 打开创作者中心发布页...');
    await page.goto(`${CREATOR_URL}/publish/publish?source=official`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    // 检测是否需要登录
    if (page.url().includes('login') || page.url().includes('passport') || !page.url().includes(CREATOR_URL)) {
      console.log('[小红书] 检测到未登录，请手动扫码/输入账号密码登录...');
      console.log('[小红书] 等待 120 秒供手动登录...');
      await page.waitForFunction(
        (base) => window.location.href.includes(base),
        CREATOR_URL,
        { timeout: 120000 }
      );
      await page.waitForTimeout(2000);
      console.log('[小红书] 登录完成，跳转到发布页...');
      await page.goto(`${CREATOR_URL}/publish/publish?source=official`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);
    }

    // 2. 切换到"上传图文"tab（JS click 绕过视口/拦截问题）
    console.log('[小红书] 切换到上传图文tab...');
    const switched = await page.evaluate(() => {
      const tabs = document.querySelectorAll('.creator-tab');
      for (const tab of tabs) {
        if (tab.textContent && tab.textContent.includes('上传图文')) {
          tab.click();
          return true;
        }
      }
      return false;
    });
    if (!switched) throw new Error('[小红书] 未找到上传图文tab');
    await page.waitForTimeout(2000);

    // 3. 上传图片
    console.log(`[小红书] 上传 ${images.length} 张图片...`);
    const absPaths = images.map(p => path.resolve(p));

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 30000 }),
      page.locator('button.d-button:has-text("上传图片")').first().click(),
    ]);
    await fileChooser.setFiles(absPaths);
    console.log('[小红书] 等待图片处理...');
    await page.waitForTimeout(8000);

    // 4. 填写标题（限20个Unicode字符，emoji算1个）
    console.log('[小红书] 填写标题...');
    // 用 Array.from 按 Unicode 码点截断，避免 emoji 占2个JS字符的问题
    const title20 = title ? Array.from(title).slice(0, 20).join('') : '';
    if (title20) {
      // 先 focus + 清空，再用 type 让浏览器自己控制输入（更可靠）
      await page.evaluate(() => {
        const el = document.querySelector('input[placeholder*="标题"]');
        if (!el) return;
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(200);
      await page.locator('input[placeholder*="标题"]').first().type(title20, { delay: 30 });
      if (title20 !== title) console.log(`[小红书] 标题已截断至20字: ${title20}`);
      await page.waitForTimeout(500);
    }

    // 5. 填写描述（JS 直接写入 contenteditable）
    console.log('[小红书] 填写描述...');
    if (desc) {
      await page.evaluate((text) => {
        const el = document.querySelector('[contenteditable="true"]');
        if (!el) return;
        el.focus();
        el.innerText = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }, desc);
      await page.waitForTimeout(800);
    }

    await page.waitForTimeout(1000);

    // 6. 点击发布按钮
    // 描述框失焦后底部工具栏收起，先滚到顶部确保坐标稳定
    // 视口 1280x900，"发布"红色按钮坐标约 (693, 855)
    console.log('[小红书] 准备点击发布按钮...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.mouse.click(693, 855);
    await page.waitForTimeout(1000);
    console.log('[小红书] 已点击发布按钮');

    // 7. 等待发布结果
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    if (currentUrl.includes('/note-manager') || currentUrl.includes('/success') || !currentUrl.includes('/publish')) {
      console.log(`[小红书] 发布成功！跳转到: ${currentUrl}`);
      return { success: true, platform: 'xiaohongshu' };
    }

    const toast = await page.locator('.d-toast, [class*="toast"], [class*="message"]').first()
      .textContent({ timeout: 3000 }).catch(() => '');
    if (toast) console.log(`[小红书] 提示信息: ${toast}`);

    console.log('[小红书] 发布完成（请到笔记管理确认）');
    return { success: true, platform: 'xiaohongshu' };

  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}
