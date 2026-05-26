/**
 * 知乎编辑器工具栏详细调试
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
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 点击发想法
await page.locator('button:has-text("发想法")').first().click();
await page.waitForTimeout(2000);

// 截图
await page.screenshot({ path: path.join(__dirname, 'debug_zhihu_toolbar.png') });

// 输出所有工具栏元素
const toolbar = await page.evaluate(() => {
  // 找编辑区域附近的工具栏
  const allEls = [...document.querySelectorAll('*')];
  const toolbarEls = allEls.filter(el => {
    const cls = (el.className || '').toString();
    return cls.includes('toolbar') || cls.includes('Toolbar') || cls.includes('ToolBar');
  });

  return toolbarEls.map(el => ({
    tag: el.tagName,
    className: el.className?.slice?.(0, 100),
    children: [...el.children].map(c => ({
      tag: c.tagName,
      className: c.className?.slice?.(0, 80),
      title: c.getAttribute('title'),
      ariaLabel: c.getAttribute('aria-label'),
      text: c.innerText?.trim().slice(0, 20),
    })),
  }));
});

console.log('工具栏元素：');
toolbar.forEach(t => {
  console.log(`\n[${t.tag}] class="${t.className}"`);
  t.children.forEach(c => console.log(`  子元素 [${c.tag}] class="${c.className}" title="${c.title}" aria="${c.ariaLabel}" text="${c.text}"`));
});

// 所有 input[type=file]
const fileInputs = await page.evaluate(() => {
  return [...document.querySelectorAll('input[type="file"]')].map(el => ({
    accept: el.getAttribute('accept'),
    className: el.className,
    id: el.id,
    style: el.getAttribute('style'),
    display: window.getComputedStyle(el).display,
    visibility: window.getComputedStyle(el).visibility,
  }));
});
console.log('\ninput[type=file]：');
fileInputs.forEach(e => console.log(`  accept="${e.accept}" display="${e.display}" visibility="${e.visibility}" class="${e.className}"`));

await context.close();
