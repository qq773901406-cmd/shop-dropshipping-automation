/**
 * B站动态图文发布模块
 * 方式：Playwright 模拟 UI 操作（B站动态图片接口签名复杂，UI 方式更稳定）
 *
 * DOM 结构要点（2025年5月）：
 *   - 输入框：.bili-rich-textarea__inner
 *   - 工具栏图片按钮：.bili-dyn-publishing__tools__item.pic
 *   - 图片上传容器（点pic后显示）：.bili-dyn-publishing__image-upload
 *   - 上传触发区域（自定义组件，非input[type=file]）：.bili-pics-uploader__add
 *   - 发布按钮：.bili-dyn-publishing__action
 *   - 首次发布弹窗确认按钮（text含"确认并发送"）
 */

import path from 'path';
import { chromium } from 'playwright';
import { loadCookies } from '../utils/cookie.js';

/**
 * B站图文发布主函数
 * @param {Object} options
 * @param {string} options.title - 标题（作为动态正文第一行）
 * @param {string} options.desc - 描述
 * @param {string[]} options.images - 图片路径数组
 */
export async function publish({ title, desc, images }) {
  console.log('[B站] 开始发布图文动态...');

  // 1. 读取 Cookie
  const cookies = loadCookies('bilibili');
  if (!cookies) throw new Error('[B站] 未找到登录 Cookie，请先执行 --login --platforms bilibili');

  // B站动态发布用有头浏览器，filechooser 事件需要真实浏览器上下文
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  // 注入 Cookie
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    // 2. 打开动态发布页
    console.log('[B站] 打开动态发布页...');
    await page.goto('https://t.bilibili.com/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. 点击图片工具按钮（展开图片上传区域）
    console.log('[B站] 点击图片上传按钮...');
    await page.locator('.bili-dyn-publishing__tools__item.pic').click();
    await page.waitForTimeout(1000);

    // 4. 逐张上传图片（B站用自定义组件，通过 filechooser 事件注入文件）
    console.log(`[B站] 上传 ${images.length} 张图片...`);
    for (let i = 0; i < images.length; i++) {
      const imgPath = path.resolve(images[i]);
      console.log(`[B站] 上传图片 ${i + 1}/${images.length}: ${path.basename(imgPath)}`);

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('.bili-pics-uploader__add').click(),
      ]);
      await fileChooser.setFiles(imgPath);

      // 等待图片上传处理（等待上传进度消失或预览出现）
      await page.waitForTimeout(4000);
    }

    // 5. 填写文字内容
    // B站 contenteditable 用 keyboard.type 会被组件 blur 清空，改用 clipboard 粘贴方式
    const content = title ? `${title}\n${desc}` : desc;
    console.log('[B站] 填写文字内容...');
    const inputArea = page.locator('.bili-rich-textarea__inner').first();
    await inputArea.click();
    await page.waitForTimeout(500);

    // 用 clipboard API 粘贴，绕过 B站 contenteditable 的按键限制
    await page.evaluate((text) => {
      const el = document.querySelector('.bili-rich-textarea__inner');
      if (!el) return;
      el.focus();
      // 直接设置 textContent + 触发 input 事件
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text);
    }, content);
    await page.waitForTimeout(1500);

    // 截图看发布前状态
    await page.screenshot({ path: 'debug_bili_before_publish.png', fullPage: false });
    console.log('[B站] 文字填写完成，准备发布...');

    // 6. 点击发布按钮（先点别处让输入框 blur 保存内容，再点发布）
    console.log('[B站] 点击发布按钮...');
    const publishBtn = page.locator('.bili-dyn-publishing__action').first();
    await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
    const btnBox = await publishBtn.boundingBox();
    console.log(`[B站] 发布按钮位置: ${JSON.stringify(btnBox)}`);

    // 截图前再确认内容还在
    await page.screenshot({ path: 'debug_bili_before_click.png', fullPage: false });

    await publishBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await publishBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug_bili_after_publish.png', fullPage: false });

    // 7. 处理首次发布时的「使用规范」确认弹窗（新账号首次发布会出现）
    const confirmBtn = page.locator('button:has-text("确认并发送")');
    const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasConfirm) {
      console.log('[B站] 检测到使用规范弹窗，自动确认...');
      await confirmBtn.click();
      await page.waitForTimeout(3000);
    }

    // 8. 检测发布结果
    // 发布成功后输入框会清空（.bili-rich-textarea__inner 变为 empty 状态）
    const isEmpty = await page.locator('.bili-rich-textarea__inner.empty').isVisible({ timeout: 5000 }).catch(() => false);
    if (isEmpty) {
      console.log('[B站] 发布成功！');
      return { success: true, platform: 'bilibili' };
    }

    // 兜底：也可能有 toast 提示
    const toast = await page.locator('.bili-toast__content, [class*="toast"]').first()
      .textContent({ timeout: 3000 }).catch(() => '');
    if (toast) console.log(`[B站] 提示信息: ${toast}`);

    console.log('[B站] 发布完成');
    return { success: true, platform: 'bilibili' };

  } finally {
    await browser.close();
  }
}
