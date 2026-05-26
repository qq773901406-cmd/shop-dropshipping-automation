/**
 * 知乎创作者中心调试脚本 - 截图并输出所有可点击元素
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
if (savedCookies) {
  await context.addCookies(savedCookies);
  console.log('已注入Cookie');
}

const page = await context.newPage();
await page.goto('https://www.zhihu.com/creator', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

// 截图
await page.screenshot({ path: path.join(__dirname, 'debug_zhihu_creator.png'), fullPage: false });
console.log('截图已保存: debug_zhihu_creator.png');

// 输出所有 button 和 a 的文本
const elements = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, a, [role="button"]')];
  return els.map(el => ({
    tag: el.tagName,
    text: el.innerText?.trim().slice(0, 40),
    className: el.className?.slice(0, 60),
  })).filter(e => e.text);
});
console.log('\n页面上所有可点击元素：');
elements.forEach(e => console.log(`  [${e.tag}] "${e.text}" | class: ${e.className}`));

await context.close();
