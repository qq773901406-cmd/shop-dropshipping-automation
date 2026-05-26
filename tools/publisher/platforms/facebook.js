/**
 * Facebook 图文发布模块
 * 方式：Playwright 模拟 facebook.com 网页版 UI 操作（个人主页动态）
 *
 * 关键交互点（2026年5月）：
 *   - 发布入口：首页顶部"在想什么？"发帖框
 *   - 图片上传：弹出框内"照片/视频"按钮 → input[type=file] 注入
 *   - 文字输入：[role="textbox"][contenteditable="true"]
 *   - 发布按钮：弹出框底部的"发布"/"Post"按钮
 *
 * 注意：Facebook 对自动化较敏感，使用持久化 profile 降低风控风险
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { loadCookies } from '../utils/cookie.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 持久化用户数据目录
const USER_DATA_DIR = path.join(__dirname, '../.browser-profiles/facebook');

/**
 * 判断 profile 目录是否已有有效 session
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
  console.log('[Facebook] 开始发布图文...');

  const hasProfile = profileExists(USER_DATA_DIR);
  let cookies = null;
  if (!hasProfile) {
    cookies = loadCookies('facebook');
    if (!cookies) throw new Error('[Facebook] profile 为空且未找到 Cookie，请先执行 --login --platforms facebook');
    console.log('[Facebook] profile 为空，将注入 Cookie 初始化 session');
  } else {
    console.log('[Facebook] 检测到已有 profile，直接复用 session');
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  if (!hasProfile && cookies) {
    await context.addCookies(cookies);
  }

  const page = await context.newPage();

  try {
    // 1. 打开 Facebook 首页
    console.log('[Facebook] 打开首页...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 2. 关闭可能出现的弹窗（记住密码、Cookie 提示等）
    for (const selector of [
      'button[data-testid="cookie-policy-manage-dialog-accept-button"]',
      'button:has-text("Allow all cookies")',
      'button:has-text("接受所有 Cookie")',
      'button:has-text("以后再说")',
      'button:has-text("Not Now")',
      '[aria-label="Close"]',
    ]) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    }

    // 3. 点击"在想什么？"/"分享你的新鲜事吧！"输入框
    console.log('[Facebook] 点击发帖框...');
    const postBox = page.locator(
      '[placeholder="What\'s on your mind?"], [placeholder*="在想什么"], [placeholder*="分享你的新鲜事"], [aria-label*="What\'s on your mind"], [aria-label*="分享你的新鲜事"]'
    ).first();
    const hasPostBox = await postBox.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasPostBox) {
      await postBox.click();
    } else {
      // 备用：找包含关键词的 role=button
      const clicked = await page.evaluate(() => {
        const els = document.querySelectorAll('[role="button"], [role="textbox"]');
        for (const el of els) {
          const txt = (el.textContent || '') + (el.getAttribute('placeholder') || '') + (el.getAttribute('aria-label') || '');
          if (txt.includes("on your mind") || txt.includes("在想什么") || txt.includes("分享你的新鲜事") || txt.includes("新鲜事")) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (!clicked) {
        await page.screenshot({ path: 'debug_fb_no_postbox.png' });
        throw new Error('[Facebook] 未找到发帖框，截图: debug_fb_no_postbox.png');
      }
    }
    await page.waitForTimeout(2000);

    // 4. 先上传图片（图片上传后界面会切换，文案输入框位置变化）
    console.log(`[Facebook] 上传 ${images.length} 张图片...`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'debug_fb_dialog.png' });
    const absPaths = images.map(p => path.resolve(p));

    // 用 JS 找弹窗内的图片/照片相关按钮（x < 650 且包含"照片"/"Photo"/"图片"/"image"关键词）
    const photoClicked = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const btns = dialog.querySelectorAll('[role="button"], button');
      for (const btn of btns) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const txt = (btn.textContent || '').toLowerCase();
        if (label.includes('photo') || label.includes('照片') || label.includes('图片') ||
            txt.includes('photo') || txt.includes('照片') || txt.includes('图片') ||
            label.includes('image') || label.includes('video') || label.includes('视频')) {
          btn.click();
          return btn.getAttribute('aria-label') || btn.textContent?.trim() || 'clicked';
        }
      }
      return false;
    });

    if (photoClicked) {
      console.log(`[Facebook] 点击了图片按钮: ${photoClicked}`);
      // 等待 filechooser
      try {
        const fileChooser = await page.waitForEvent('filechooser', { timeout: 10000 });
        await fileChooser.setFiles(absPaths);
      } catch {
        // filechooser 没出现，尝试直接找 input[type=file]
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(absPaths);
        } else {
          console.warn('[Facebook] 图片上传入口未找到，将发布纯文字动态');
        }
      }
    } else {
      // 没找到按钮，直接找 input[type=file]
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(absPaths);
        console.log('[Facebook] 通过 input[type=file] 上传图片');
      } else {
        await page.screenshot({ path: 'debug_fb_no_photo.png' });
        console.warn('[Facebook] 未找到图片上传入口，将发布纯文字动态');
      }
    }

    console.log('[Facebook] 等待图片上传...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'debug_fb_before_post.png' });

    // 5. 图片上传后填写文案（图片上传后界面切换，文案框变为"添加更多内容"）
    const content = title ? `${title}\n\n${desc}` : desc;
    if (content) {
      console.log('[Facebook] 填写文字内容...');
      // 图片上传后的文案框：placeholder 为"添加更多内容" 或 contenteditable
      let textFilled = false;
      try {
        // 优先找图片上传后出现的文案输入框
        const editor = page.locator('[role="dialog"] [contenteditable="true"]').last();
        await editor.waitFor({ state: 'visible', timeout: 8000 });
        await editor.click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.type(content, { delay: 20 });
        textFilled = true;
        console.log('[Facebook] 文字填写完成（图片后输入框）');
      } catch {
        // 兜底：JS 找所有 contenteditable，点最后一个（图片上传后新出现的）
        await page.evaluate(() => {
          const els = [...document.querySelectorAll('[contenteditable="true"]')];
          const el = els[els.length - 1];
          if (el) { el.focus(); el.click(); }
        });
        await page.waitForTimeout(300);
        await page.keyboard.type(content, { delay: 20 });
        console.log('[Facebook] 文字填写完成（JS fallback）');
      }
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'debug_fb_before_click.png' });
    }

    // 6. 点击"发布"/"继续"/"Post"按钮
    console.log('[Facebook] 点击发布按钮...');

    // 方法1：用 Playwright locator + force:true 直接点击（优先）
    const keywords = ['继续', '发布', 'Post', 'Continue', 'Share'];
    let clicked = false;
    for (const kw of keywords) {
      try {
        const btn = page.getByRole('button', { name: kw, exact: true });
        const count = await btn.count();
        if (count > 0) {
          await btn.last().click({ force: true, timeout: 5000 });
          console.log(`[Facebook] Playwright 点击了"${kw}"按钮`);
          clicked = true;
          break;
        }
      } catch { /* 继续下一个关键词 */ }
    }

    // 方法2：JS 遍历所有 button/role=button，textContent 包含关键词即点击
    if (!clicked) {
      const result = await page.evaluate(() => {
        const keywords = ['继续', '发布', 'Post', 'Continue', 'Share'];
        // 先找 role=button 或 button 标签
        const candidates = [...document.querySelectorAll('[role="button"], button')];
        for (const kw of keywords) {
          for (const el of candidates) {
            const txt = el.textContent?.trim() || '';
            if (txt === kw || txt.includes(kw)) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 30 && rect.height > 20 && rect.top > 0) {
                el.click();
                return kw;
              }
            }
          }
        }
        return false;
      });
      if (result) {
        console.log(`[Facebook] JS 点击了"${result}"按钮`);
        clicked = true;
      }
    }

    // 方法3：JS 遍历所有元素（不限 button 标签），匹配 textContent
    if (!clicked) {
      const result = await page.evaluate(() => {
        const keywords = ['继续', '发布', 'Post', 'Continue', 'Share'];
        for (const kw of keywords) {
          for (const el of document.querySelectorAll('*')) {
            const txt = el.textContent?.trim() || '';
            if (txt === kw && el.offsetParent !== null) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 30 && rect.height > 20) {
                el.click();
                return kw;
              }
            }
          }
        }
        return false;
      });
      if (result) {
        console.log(`[Facebook] JS全局 点击了"${result}"按钮`);
        clicked = true;
      }
    }

    if (!clicked) throw new Error('[Facebook] 找不到"继续/发布"按钮');

    // 7. 处理第二步"帖子设置"页面（点"继续"后可能跳转到此页面，需再点"发帖"）
    console.log('[Facebook] 等待帖子设置页面或直接发布...');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug_fb_after_continue.png' });

    // 检测是否有"发帖"按钮（帖子设置第二页）
    const postKeywords = ['发帖', 'Post', 'Share', '发布'];
    let finalClicked = false;
    for (const kw of postKeywords) {
      try {
        const btn = page.getByRole('button', { name: kw, exact: true });
        const count = await btn.count();
        if (count > 0) {
          await btn.last().click({ force: true, timeout: 5000 });
          console.log(`[Facebook] 点击了第二步"${kw}"按钮`);
          finalClicked = true;
          break;
        }
      } catch { /* 继续 */ }
    }
    if (!finalClicked) {
      // JS兜底
      const result = await page.evaluate(() => {
        const kws = ['发帖', 'Post', 'Share', '发布'];
        for (const kw of kws) {
          for (const el of document.querySelectorAll('[role="button"], button')) {
            const txt = el.textContent?.trim() || '';
            if (txt === kw) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 30 && rect.height > 20) { el.click(); return kw; }
            }
          }
        }
        return null;
      });
      if (result) {
        console.log(`[Facebook] JS 点击了第二步"${result}"按钮`);
        finalClicked = true;
      }
    }

    // 等待最终发布完成
    console.log('[Facebook] 等待发布完成...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'debug_fb_after_post.png' });

    // 检测弹窗是否已关闭（说明发布完成）
    const dialogClosed = await page.locator('[role="dialog"]').isVisible({ timeout: 5000 }).then(v => !v).catch(() => true);
    if (dialogClosed) {
      console.log('[Facebook] 发布成功！');
    } else {
      console.log('[Facebook] 发布完成（请手动确认）');
    }

    return { success: true, platform: 'facebook' };

  } finally {
    await page.waitForTimeout(3000);
    await context.close();
  }
}
