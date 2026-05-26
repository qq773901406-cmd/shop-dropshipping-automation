/**
 * Instagram 图文发布模块
 * 方式：Playwright 模拟 instagram.com 网页版 UI 操作
 *
 * 关键交互点（2026年5月）：
 *   - 发布入口：点击导航栏"+"新建帖子按钮
 *   - 弹窗流程：选择图片 → 裁剪 → 滤镜 → 填写文案 → 发布
 *   - 上传：点击"从电脑上传"按钮触发 filechooser
 *   - 多图：通过对话框内多选文件一次性上传
 *   - 描述输入框：textarea[aria-label="撰写说明..."] 或 [aria-label="Write a caption..."]
 *   - 发布按钮：最后一步弹窗中的"分享"/"Share"按钮
 *
 * 注意：Instagram 对自动化操作较敏感，使用持久化 profile 降低风控风险
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { loadCookies } from '../utils/cookie.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 持久化用户数据目录，保留浏览器指纹/session
const USER_DATA_DIR = path.join(__dirname, '../.browser-profiles/instagram');

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
  console.log('[Instagram] 开始发布图文...');

  const hasProfile = profileExists(USER_DATA_DIR);
  let cookies = null;
  if (!hasProfile) {
    cookies = loadCookies('instagram');
    if (!cookies) throw new Error('[Instagram] profile 为空且未找到 Cookie，请先执行 --login --platforms instagram');
    console.log('[Instagram] profile 为空，将注入 Cookie 初始化 session');
  } else {
    console.log('[Instagram] 检测到已有 profile，直接复用 session');
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
    // 1. 打开 Instagram 首页
    console.log('[Instagram] 打开首页...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 2. 关闭可能出现的通知弹窗
    const notNowBtn = page.locator('button:has-text("Not Now"), button:has-text("以后再说")').first();
    if (await notNowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await notNowBtn.click();
      await page.waitForTimeout(1000);
    }

    // 3. 点击左侧导航"+ Create"按钮，展开子菜单，再点 "Post"
    console.log('[Instagram] 点击 Create 按钮，展开菜单...');

    // "Create" 按钮：文字为 "Create"，或 aria-label 含 "Create"
    const createBtn = page.locator(
      '[aria-label="New post"], [aria-label="Create"], a:has-text("Create"), span:has-text("Create")'
    ).first();
    await createBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createBtn.click();
    console.log('[Instagram] 已点击 Create，等待 Post 菜单项...');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'debug_ig_after_create_click.png' });

    // 点击菜单中的 "Post" 项
    // 策略：通过 JS 找左侧导航区域（x < 220）内文字精确为 "Post" 的叶子节点元素并点击
    // 避免匹配到帖子内容区域中包含 "Post" 文字的其他元素
    const postClicked = await page.evaluate(() => {
      // 遍历所有可见元素，找 x 坐标在左侧边栏范围内（< 250px）且文字精确为 "Post" 的元素
      const allEls = document.querySelectorAll('a, span, div, li');
      for (const el of allEls) {
        const rect = el.getBoundingClientRect();
        const txt = el.textContent?.trim();
        // 必须：在左侧导航区（x < 250），文字精确是 "Post"，元素可见
        if (
          txt === 'Post' &&
          rect.left < 250 &&
          rect.width > 0 &&
          rect.height > 0 &&
          el.offsetParent !== null
        ) {
          el.click();
          return { x: rect.x, y: rect.y, tag: el.tagName };
        }
      }
      return null;
    });
    if (postClicked) {
      console.log(`[Instagram] 已精准点击 Post 菜单项 (${postClicked.tag} at x=${postClicked.x}, y=${postClicked.y})`);
    } else {
      // 兜底：按坐标点击左侧 Post 位置（根据截图约 x=112, y=574）
      console.log('[Instagram] JS 未找到 Post 菜单项，尝试坐标点击...');
      await page.mouse.click(112, 574);
    }

    // 等待发布弹窗中的 input[type=file] 或 "Select from computer" 按钮出现
    console.log('[Instagram] 等待发布弹窗出现 (input[type=file] 或 Select 按钮)...');
    let fileInput = null;
    try {
      await page.waitForSelector(
        'input[type="file"], button:has-text("Select from computer"), button:has-text("从电脑上传")',
        { timeout: 15000 }
      );
      const inputEl = page.locator('input[type="file"]').first();
      if (await inputEl.count() > 0) {
        fileInput = inputEl;
        console.log('[Instagram] 检测到 input[type=file]，弹窗已就绪');
      } else {
        console.log('[Instagram] 检测到 Select from computer 按钮，弹窗已就绪');
      }
    } catch {
      await page.screenshot({ path: 'debug_ig_no_input.png' });
      throw new Error('[Instagram] 无法触发文件上传弹窗，截图: debug_ig_no_input.png');
    }

    // 4. 注入图片文件（先注入第1张，后续用"添加更多"按钮加图）
    console.log(`[Instagram] 上传图片（共 ${images.length} 张）...`);
    const absPaths = images.map(p => path.resolve(p));
    await page.screenshot({ path: 'debug_ig_before_upload.png' });

    // 尝试通过 filechooser 传多张（如果弹窗支持）
    const selectBtn = page.locator(
      'button:has-text("Select from computer"), button:has-text("Select From Computer"), button:has-text("从电脑上传")'
    ).first();
    const hasSelectBtn = await selectBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSelectBtn) {
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        selectBtn.click(),
      ]);
      // 尝试多选（filechooser 支持多选）
      try {
        await fc.setFiles(absPaths);
        console.log(`[Instagram] filechooser 传入 ${absPaths.length} 张图片`);
      } catch {
        await fc.setFiles(absPaths[0]);
        console.log('[Instagram] filechooser 仅支持单选，传入第1张');
      }
    } else if (fileInput) {
      // 直接注入，单张（Instagram input 不支持 multiple）
      await fileInput.setInputFiles(absPaths[0]);
      console.log('[Instagram] 已通过 input[type=file] 传入第1张图片');
    } else {
      await page.screenshot({ path: 'debug_ig_no_upload.png' });
      throw new Error('[Instagram] 未找到图片上传入口，截图: debug_ig_no_upload.png');
    }

    console.log('[Instagram] 等待图片加载...');
    await page.waitForTimeout(4000);

    // 6. 循环点击"Next"，直到 Caption 输入框出现（最多点 5 次）
    // Instagram 发帖流程：Crop → Edit/Filter → Caption → Advanced → Share
    console.log('[Instagram] 逐步点击 Next，等待 Caption 输入框出现...');
    const caption = title ? `${title}\n\n${desc}` : desc;
    let captionFilled = false;
    for (let i = 0; i < 5; i++) {
      // 优先检查 Caption 输入框是否已出现
      const captionEl = page.locator(
        'textarea[aria-label="Write a caption..."], textarea[aria-label="撰写说明..."], [aria-label*="caption" i], [placeholder*="caption" i], [contenteditable][aria-label*="caption" i]'
      ).first();
      const hasCaptionEl = await captionEl.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasCaptionEl && caption) {
        console.log(`[Instagram] 第 ${i + 1} 步检测到 Caption 输入框，填写描述...`);
        await captionEl.click();
        await page.keyboard.type(caption);
        await page.waitForTimeout(1000);
        captionFilled = true;
        break;
      }

      // 检查是否有 Next 按钮（Instagram 使用 div/span/button 多种标签）
      const nextBtn = page.locator(
        'button:has-text("Next"), div:has-text("Next"), [role="button"]:has-text("Next"), button:has-text("下一步"), div:has-text("下一步")'
      ).last();
      // 更可靠：直接用 JS 找右上角可见的 "Next" 元素
      const nextClicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('*')) {
          const txt = el.textContent?.trim();
          if ((txt === 'Next' || txt === '下一步') && el.offsetParent !== null && el.children.length === 0) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });
      if (nextClicked) {
        console.log(`[Instagram] 第 ${i + 1} 步点击 Next...`);
        await page.waitForTimeout(2500);
      } else {
        console.log(`[Instagram] 第 ${i + 1} 步无 Next 按钮，停止`);
        break;
      }
    }

    // 如果没有找到 Caption 输入框，直接跳过（可能描述区 aria-label 不一致）
    if (!captionFilled && caption) {
      console.log('[Instagram] 未找到 Caption 输入框，尝试 contenteditable...');
      const editableEl = page.locator('[contenteditable="true"]').first();
      const hasEditable = await editableEl.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasEditable) {
        await editableEl.click();
        await page.keyboard.type(caption);
        await page.waitForTimeout(1000);
      }
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'debug_ig_before_share.png' });

    // 7. 点击"分享"/"Share"发布按钮（Instagram 使用 div/span，不一定是 button）
    console.log('[Instagram] 点击分享按钮...');
    const clicked = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        const txt = el.textContent?.trim();
        if ((txt === 'Share' || txt === '分享') && el.offsetParent !== null && el.children.length === 0) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.click();
            return true;
          }
        }
      }
      return false;
    });
    if (!clicked) {
      // 兜底：Playwright 选择器
      const shareBtn = page.locator('button:has-text("Share"), div:has-text("Share"), [role="button"]:has-text("Share"), button:has-text("分享"), div:has-text("分享")').last();
      const hasShare = await shareBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasShare) {
        await shareBtn.click();
      } else {
        throw new Error('[Instagram] 找不到"分享"按钮');
      }
    } else {
      console.log('[Instagram] Share 按钮点击成功');
    }

    // 9. 等待发布完成（页面弹出"Your post has been shared"等提示）
    console.log('[Instagram] 等待发布完成（最长等待 60 秒）...');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug_ig_after_share.png' });

    // 检测成功提示
    const successMsg = page.locator('span:has-text("Your post has been shared"), span:has-text("已分享")').first();
    const isSuccess = await successMsg.isVisible({ timeout: 30000 }).catch(() => false);
    if (isSuccess) {
      console.log('[Instagram] 发布成功！');
    } else {
      console.log('[Instagram] 发布完成（请手动确认）');
    }

    return { success: true, platform: 'instagram' };

  } finally {
    await page.waitForTimeout(3000);
    await context.close();
  }
}
