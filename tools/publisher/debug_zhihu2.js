/**
 * 知乎弹窗调试 - 截图并找关闭按钮
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
await page.waitForTimeout(4000);

// 查找所有弹窗/modal相关元素
const modalInfo = await page.evaluate(() => {
  const selectors = [
    '[class*="Modal"]',
    '[class*="modal"]', 
    '[class*="dialog"]',
    '[class*="Dialog"]',
    '[class*="popup"]',
    '[class*="Popup"]',
    '[class*="overlay"]',
    '[role="dialog"]',
  ];
  const results = [];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    els.forEach(el => {
      results.push({
        selector: sel,
        tag: el.tagName,
        className: el.className?.slice(0, 80),
        text: el.innerText?.trim().slice(0, 50),
      });
    });
  }
  return results;
});
console.log('弹窗相关元素：');
modalInfo.forEach(e => console.log(`  ${e.selector} | [${e.tag}] class="${e.className}" | "${e.text}"`));

// 找所有可能的关闭按钮
const closeBtns = await page.evaluate(() => {
  const els = [...document.querySelectorAll('*')];
  return els
    .filter(el => {
      const cls = (el.className || '').toString().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return cls.includes('close') || aria.includes('close') || aria.includes('关闭');
    })
    .map(el => ({
      tag: el.tagName,
      className: el.className?.slice?.(0, 80) || '',
      ariaLabel: el.getAttribute('aria-label'),
      text: el.innerText?.trim().slice(0, 30),
    }));
});
console.log('\n可能的关闭按钮：');
closeBtns.forEach(e => console.log(`  [${e.tag}] class="${e.className}" aria="${e.ariaLabel}" text="${e.text}"`));

await page.screenshot({ path: path.join(__dirname, 'debug_zhihu_modal.png') });
console.log('\n截图已保存');
await context.close();
