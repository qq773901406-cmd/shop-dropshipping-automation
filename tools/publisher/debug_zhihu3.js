/**
 * 知乎发想法编辑器调试 - 截图找图片上传按钮
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
if (savedCookies) await context.addCookies(savedCookies);

const page = await context.newPage();
await page.goto('https://www.zhihu.com/creator', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

// 关闭可能的弹窗
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 点击发想法
const pinBtn = page.locator('button:has-text("发想法")').first();
await pinBtn.click();
await page.waitForTimeout(2000);

// 截图看编辑器
await page.screenshot({ path: path.join(__dirname, 'debug_zhihu_editor.png') });
console.log('截图已保存: debug_zhihu_editor.png');

// 找图片相关按钮
const imgBtns = await page.evaluate(() => {
  const els = [...document.querySelectorAll('*')];
  return els
    .filter(el => {
      const cls = (el.className || '').toString().toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const text = (el.innerText || '').trim().toLowerCase();
      return cls.includes('image') || cls.includes('picture') || cls.includes('photo') || cls.includes('img') ||
             title.includes('图') || aria.includes('图') || text === '图片' ||
             title.includes('image') || aria.includes('image');
    })
    .map(el => ({
      tag: el.tagName,
      className: el.className?.slice?.(0, 80) || '',
      title: el.getAttribute('title'),
      ariaLabel: el.getAttribute('aria-label'),
      text: el.innerText?.trim().slice(0, 30),
    }));
});
console.log('图片相关按钮：');
imgBtns.forEach(e => console.log(`  [${e.tag}] class="${e.className}" title="${e.title}" aria="${e.ariaLabel}" text="${e.text}"`));

// 找 input[type=file]
const fileInputs = await page.evaluate(() => {
  return [...document.querySelectorAll('input[type="file"]')].map(el => ({
    accept: el.getAttribute('accept'),
    className: el.className,
    id: el.id,
  }));
});
console.log('\ninput[type=file] 元素：');
fileInputs.forEach(e => console.log(`  accept="${e.accept}" class="${e.className}" id="${e.id}"`));

await context.close();
