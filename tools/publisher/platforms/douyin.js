/**
 * 抖音图文发布模块
 * 方式：Playwright 模拟创作者后台 UI 操作
 *
 * 关键交互点（2026年5月）：
 *   - 发布页：https://creator.douyin.com/creator-micro/content/upload
 *   - 默认是"发布视频"tab，需要点击切换到"发布图文"
 *   - tab class：.tab-item-BcCLTS，文本为"发布图文"
 *   - 切换后出现图片专属 file input：input[accept*="image/png"]
 *   - 上传图文按钮：button.semi-button:has-text("上传图文")，点击触发 filechooser
 *   - 上传成功后跳转到编辑页，填写标题/描述
 *   - 发布按钮：最后一步页面右侧"发布"按钮
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { loadCookies } from '../utils/cookie.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 持久化用户数据目录，保留浏览器指纹/session，避免每次都被抖音风控触发短信验证
const USER_DATA_DIR = path.join(__dirname, '../.browser-profiles/douyin');

const UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';

/**
 * 判断 profile 目录是否已有有效 session（目录存在且非空）
 * profile 存在时直接复用，不再注入 Cookie——重复注入会覆盖 session 状态，
 * 导致抖音把当前设备识别为新设备并触发风控/短信验证。
 */
function profileExists(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.length > 0;
  } catch {
    return false;
  }
}

export async function publish({ title, desc, images }) {
  console.log('[抖音] 开始发布图文...');

  // profile 有效时无需 Cookie；profile 为空时才用 Cookie 初始化 session
  const hasProfile = profileExists(USER_DATA_DIR);
  let cookies = null;
  if (!hasProfile) {
    cookies = loadCookies('douyin');
    if (!cookies) throw new Error('[抖音] profile 为空且未找到 Cookie，请先执行 --login --platforms douyin');
    console.log('[抖音] profile 为空，将注入 Cookie 初始化 session');
  } else {
    console.log('[抖音] 检测到已有 profile，直接复用 session，跳过 Cookie 注入');
  }

  // 用持久化上下文保留浏览器指纹，避免每次都触发短信验证码
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  // 仅在 profile 为空（首次）时注入 Cookie；有 profile 时跳过，避免覆盖已有 session
  if (!hasProfile && cookies) {
    await context.addCookies(cookies);
  }
  const page = await context.newPage();

  try {
    // 1. 打开上传页
    console.log('[抖音] 打开创作者中心上传页...');
    // networkidle 在抖音创作者中心容易超时（页面有持续后台请求），改用 domcontentloaded
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 关闭可能出现的引导弹窗
    const popup = page.locator('button:has-text("我知道了")');
    if (await popup.isVisible({ timeout: 2000 }).catch(() => false)) {
      await popup.click();
      await page.waitForTimeout(500);
    }

    // 2. 切换到"发布图文"tab
    // 不依赖 CSS hash class（会随版本变化），改用文本内容定位
    console.log('[抖音] 切换到发布图文tab...');
    // 先等页面稳定，再截图查看结构
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug_dy_before_tab.png' });

    // 用文本精确匹配找"发布图文" tab，兼容各种 class 名
    const imgTextTab = page.locator('text="发布图文"').first();
    const hasImgTab = await imgTextTab.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasImgTab) {
      await imgTextTab.click();
      console.log('[抖音] 已点击"发布图文"tab（text 定位）');
    } else {
      // 备用：JS 遍历所有可点击元素找文本匹配
      const switched = await page.evaluate(() => {
        const els = document.querySelectorAll('[role="tab"], .tab-item, [class*="tab"]');
        for (const el of els) {
          if (el.textContent?.trim() === '发布图文') {
            el.click();
            return true;
          }
        }
        // 再扩大范围找所有 span/div
        for (const el of document.querySelectorAll('span, div')) {
          if (el.textContent?.trim() === '发布图文') {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (!switched) {
        await page.screenshot({ path: 'debug_dy_tab_fail.png' });
        throw new Error('[抖音] 未找到"发布图文"tab，截图已保存至 debug_dy_tab_fail.png');
      }
      console.log('[抖音] 已点击"发布图文"tab（JS 遍历定位）');
    }
    await page.waitForTimeout(2000);

    // 3. 上传图片（通过 filechooser 事件）
    console.log(`[抖音] 上传 ${images.length} 张图片...`);
    const absPaths = images.map(p => path.resolve(p));
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      // 点击"上传图文"红色按钮触发文件选择
      page.locator('button.semi-button:has-text("上传图文")').first().click(),
    ]);
    await fileChooser.setFiles(absPaths);

    // 4. 等待上传完成并跳转到编辑页（实际URL：/creator-micro/content/post/image）
    console.log('[抖音] 等待图片上传并跳转编辑页...');
    await page.waitForURL(/\/post\/image/, { timeout: 30000 });
    await page.waitForTimeout(4000); // 等待图片上传至服务器完成
    await page.screenshot({ path: 'debug_dy_edit.png' });
    console.log('[抖音] 已进入编辑页，截图: debug_dy_edit.png');

    // 5. 填写标题
    if (title) {
      console.log('[抖音] 填写标题...');
      const titleInput = page.locator('input[placeholder="添加作品标题"]').first();
      const hasTitle = await titleInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasTitle) {
        await titleInput.click();
        await titleInput.fill(title);
      }
    }

    // 6. 填写描述（contenteditable 富文本编辑器）
    if (desc) {
      console.log('[抖音] 填写描述...');
      const descEl = page.locator('[contenteditable="true"]').first();
      const hasDesc = await descEl.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasDesc) {
        await descEl.click();
        await page.keyboard.type(desc);
      }
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'debug_dy_before_publish.png' });

    // 7. 点击发布按钮（不依赖 hash class，用文本+类型定位）
    console.log('[抖音] 点击发布按钮...');
    // 优先用 Playwright text 定位 type=button 的"发布"按钮
    const publishBtn = page.locator('button:has-text("发布")').last();
    const hasPublish = await publishBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (hasPublish) {
      await publishBtn.click();
    } else {
      // 备用：JS 遍历
      const clicked = await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent?.trim() === '发布') { btn.click(); return true; }
        }
        return false;
      });
      if (!clicked) throw new Error('[抖音] 找不到"发布"按钮');
    }

    // 8. 等待发布结果
    // 抖音可能弹出滑块/验证码，需要给用户足够时间手动处理，再等待成功跳转
    console.log('[抖音] 等待发布结果（若出现验证码请手动完成，最长等待 120 秒）...');

    // 先等 3 秒让弹窗有时间出现
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug_dy_after_click.png' });

    // 检测是否停留在当前页（说明可能有验证码）
    // 等待跳转离开 post/image 页，或者超时后截图留存
    try {
      await page.waitForFunction(
        () => !window.location.href.includes('/post/image'),
        { timeout: 120000, polling: 1000 }
      );
      console.log('[抖音] 页面已跳转，发布成功！');
    } catch {
      // 120 秒内未跳转，截图并报错
      await page.screenshot({ path: 'debug_dy_timeout.png' });
      throw new Error('[抖音] 等待发布超时（120s），可能验证码未完成，截图: debug_dy_timeout.png');
    }

    const currentUrl = page.url();
    console.log(`[抖音] 发布后 URL: ${currentUrl}`);
    await page.screenshot({ path: 'debug_dy_result.png' });

    // 发布成功后等 3 秒再关浏览器，让用户确认页面
    await page.waitForTimeout(3000);
    console.log('[抖音] 发布完成！');
    return { success: true, platform: 'douyin' };

  } finally {
    // 关浏览器前额外等 3 秒，方便人工确认
    await page.waitForTimeout(3000);
    await context.close();
  }
}
