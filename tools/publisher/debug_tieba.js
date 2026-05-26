/**
 * 贴吧调试 - 截图并找发帖按钮
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies } from './utils/cookie.js';

chromium.use(StealthPlugin());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, 'profiles', 'tieba');

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

const savedCookies = loadCookies('tieba');
if (savedCookies) await context.addCookies(savedCookies);

const page = await context.newPage();
await page.goto('https://tieba.baidu.com/f?kw=%E8%B7%A8%E5%A2%83%E7%94%B5%E5%95%86', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

await page.screenshot({ path: path.join(__dirname, 'debug_tieba_bar.png') });
console.log('截图已保存: debug_tieba_bar.png');

// 输出所有 a 和 button 文本
const btns = await page.evaluate(() => {
  return [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')]
    .map(el => ({
      tag: el.tagName,
      text: (el.innerText || el.value || '').trim().slice(0, 30),
      href: el.href || '',
      className: (el.className || '').slice(0, 60),
    }))
    .filter(e => e.text);
});
console.log('\n页面所有按钮/链接：');
btns.forEach(e => console.log(`  [${e.tag}] "${e.text}" | class="${e.className}" href="${e.href.slice(0, 50)}"`));

await context.close();
