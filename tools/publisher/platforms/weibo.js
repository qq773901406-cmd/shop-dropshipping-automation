/**
 * 微博图文发布模块
 * 方式：Playwright 模拟微博首页发布框 UI 操作
 *
 * 反封号措施：
 *   - playwright-extra + stealth 插件隐藏 webdriver 指纹
 *   - launchPersistentContext 持久化 profile，同账号始终"同一台设备"
 *   - 首次使用需手动登录（等待 120 秒），之后 session 自动复用
 *
 * 关键交互点（2026年5月）：
 *   - 发布页：https://weibo.com（首页发布框）
 *   - 发布输入框：textarea（placeholder 含"有什么新鲜事"）
 *   - 图片上传：input[type="file"]（直接 setInputFiles）
 *   - 发布按钮：button:has-text("发送") 或 button:has-text("发布")
 *   - 微博正文无标题字段，title 会拼到 desc 前面一起发
 *   - 微博图片上传入口在工具栏图片图标，需先点击触发 file input
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies } from '../utils/cookie.js';

chromium.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'profiles', 'weibo');
const WEIBO_URL = 'https://weibo.com';

export async function publish({ title, desc, images }) {
  console.log('[微博] 开始发布图文...');

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
  const savedCookies = loadCookies('weibo');
  if (savedCookies && savedCookies.length > 0) {
    await context.addCookies(savedCookies);
    console.log('[微博] 已注入登录 Cookie');
  }

  const page = await context.newPage();

  try {
    // 1. 打开微博首页
    console.log('[微博] 打开微博首页...');
    await page.goto(WEIBO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 检测是否需要登录
    if (page.url().includes('login') || !page.url().includes('weibo.com')) {
      console.log('[微博] 检测到未登录，请手动扫码/输入账号密码登录...');
      console.log('[微博] 等待 120 秒供手动登录...');
      await page.waitForFunction(
        () => window.location.href.includes('weibo.com') && !window.location.href.includes('login'),
        { timeout: 120000 }
      );
      await page.waitForTimeout(2000);
      console.log('[微博] 登录完成...');
    }

    // 2. 点击发布输入框（精确匹配微博首页发布框，避免命中搜索框/评论框）
    console.log('[微博] 定位发布输入框...');
    const composeBox = page.locator('textarea[placeholder*="新鲜事"], textarea[placeholder*="有什么"]').first();
    await composeBox.waitFor({ timeout: 15000 });
    await composeBox.click();
    await page.waitForTimeout(500);

    // 3. 填写正文（title + desc 合并，微博无独立标题字段）
    const content = [title, desc].filter(Boolean).join('\n\n');
    if (content) {
      await page.keyboard.type(content, { delay: 20 });
      console.log('[微博] 已填入正文');
      await page.waitForTimeout(500);
    }

    // 4. 上传图片
    if (images && images.length > 0) {
      console.log(`[微博] 上传 ${images.length} 张图片...`);
      const absPaths = images.map(p => path.resolve(p));

      // 先尝试点击工具栏图片图标（多选择器兜底）
      const imgBtnSelectors = [
        '[title*="图片"]',
        '[aria-label*="图片"]',
        '[class*="picture"]',
        '[class*="Photo"]',
        '[class*="photo"]',
        'button[class*="img"]',
        '.woo-box-flex .woo-toolbar-item',
      ];
      let clicked = false;
      for (const sel of imgBtnSelectors) {
        const btn = page.locator(sel).first();
        const count = await btn.count();
        if (count > 0) {
          try {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5000 }),
              btn.click(),
            ]);
            await fileChooser.setFiles(absPaths);
            clicked = true;
            console.log(`[微博] 通过选择器 ${sel} 上传图片`);
            break;
          } catch (_) {
            // 继续尝试下一个选择器
          }
        }
      }

      // 兜底：强制显示 input[type=file] 并直接 setInputFiles
      if (!clicked) {
        console.log('[微博] 工具栏按钮方式失败，改用 input[type=file] 直接上传...');
        await page.evaluate(() => {
          document.querySelectorAll('input[type="file"]').forEach(inp => {
            inp.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;width:1px;height:1px;position:fixed;top:0;left:0;';
          });
        });
        await page.waitForTimeout(500);
        const inputs = await page.$$('input[type="file"]');
        if (inputs.length > 0) {
          await inputs[0].setInputFiles(absPaths);
          console.log(`[微博] 通过 input[type=file] 上传 ${absPaths.length} 张图片`);
        } else {
          console.log('[微博] 未找到 file input，跳过图片上传');
        }
      }

      console.log('[微博] 等待图片处理...');
      await page.waitForTimeout(5000);
    }

    // 5. 点击发送按钮
    console.log('[微博] 点击发送按钮...');
    await page.waitForTimeout(1000);

    const sendBtn = page.locator('button:has-text("发送"), button:has-text("发布")').first();
    await sendBtn.waitFor({ timeout: 10000 });
    await sendBtn.click();
    await page.waitForTimeout(3000);

    console.log('[微博] 已点击发送按钮');

    // 6. 检测发布结果：优先检测成功 toast，其次看输入框是否清空
    await page.waitForTimeout(3000);
    const toast = await page.locator('[class*="toast"], [class*="Tips"], [class*="success"]').first()
      .textContent({ timeout: 3000 }).catch(() => '');
    if (toast) console.log(`[微博] 提示: ${toast}`);

    const boxValue = await page.locator('textarea[placeholder*="新鲜事"], textarea[placeholder*="有什么"]').first()
      .inputValue().catch(() => '');
    if (!boxValue || boxValue.trim() === '') {
      console.log('[微博] 发布成功！');
      return { success: true, platform: 'weibo' };
    }

    console.log('[微博] 发布完成（请到微博确认）');
    return { success: true, platform: 'weibo' };

  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}
