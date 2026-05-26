/**
 * 使用系统 Chrome 的已登录 profile 启动浏览器并提取 Cookies
 * 原理：用 Playwright 的 launchPersistentContext 指定系统 Chrome 的 User Data 目录
 *       Chrome 的登录 session 会直接复用，无需重新登录
 *
 * 用法：
 *   关闭 Chrome 后运行：
 *   node utils/steal-chrome-session.js youtube
 *   node utils/steal-chrome-session.js facebook
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_DIR = path.join(__dirname, '..', 'cookies');

const PLATFORM_CONFIG = {
  youtube: {
    url: 'https://www.youtube.com/',
    checkUrl: 'youtube.com',
    requiredCookies: ['SID', 'HSID', 'SSID'],
    domains: ['.google.com', '.youtube.com'],
    hint: '请确保 YouTube 已在系统 Chrome 中登录',
  },
  facebook: {
    url: 'https://www.facebook.com/',
    checkUrl: 'facebook.com',
    requiredCookies: ['c_user', 'xs'],
    domains: ['.facebook.com'],
    hint: '请确保 Facebook 已在系统 Chrome 中登录',
  },
};

// 系统 Chrome 可执行文件路径
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// 系统 Chrome User Data 目录（复制一份，避免与运行中的 Chrome 冲突）
const CHROME_USER_DATA = path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data');
// 临时复制目录
const TEMP_PROFILE = path.join(os.tmpdir(), 'playwright_chrome_temp_profile');

async function extractSession(platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) {
    console.error(`不支持的平台: ${platform}`);
    process.exit(1);
  }

  console.log(`[提取] 平台: ${platform}`);
  console.log(`[提示] ${config.hint}`);
  console.log('[警告] 请先完全关闭系统 Chrome 浏览器，否则会有冲突！\n');

  // 复制 Chrome profile 到临时目录（避免与正在运行的 Chrome 冲突）
  console.log('[提取] 复制 Chrome profile 到临时目录...');
  if (fs.existsSync(TEMP_PROFILE)) {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  }

  // 只复制 Default 目录下的关键文件
  const srcDefault = path.join(CHROME_USER_DATA, 'Default');
  const dstDefault = path.join(TEMP_PROFILE, 'Default');
  fs.mkdirSync(dstDefault, { recursive: true });

  // 复制 Cookies、Local State（解密密钥需要）
  const filesToCopy = ['Network/Cookies', 'Preferences', 'Secure Preferences'];
  for (const f of filesToCopy) {
    const src = path.join(srcDefault, f);
    const dst = path.join(dstDefault, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }

  // 复制 Local State（包含解密密钥）
  const localStateSrc = path.join(CHROME_USER_DATA, 'Local State');
  const localStateDst = path.join(TEMP_PROFILE, 'Local State');
  if (fs.existsSync(localStateSrc)) {
    fs.copyFileSync(localStateSrc, localStateDst);
  }

  console.log('[提取] 启动带系统 Chrome session 的浏览器...');

  const context = await chromium.launchPersistentContext(TEMP_PROFILE, {
    executablePath: CHROME_EXE,
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await context.newPage();

  console.log(`[提取] 打开 ${config.url}...`);
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 提取 cookies
  const cookies = await context.cookies(config.domains.map(d => `https://${d.replace(/^\./, '')}/`));

  const requiredFound = config.requiredCookies.filter(name =>
    cookies.find(c => c.name === name && c.value)
  );

  console.log('\n[提取] Cookie 检查：');
  for (const name of config.requiredCookies) {
    const c = cookies.find(c => c.name === name);
    if (c?.value) {
      console.log(`  ✅ ${name} = ${c.value.substring(0, 20)}...`);
    } else {
      console.log(`  ❌ ${name} (未找到或值为空)`);
    }
  }

  await context.close();

  // 清理临时目录
  fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });

  if (requiredFound.length === 0) {
    console.error(`\n❌ 关键 Cookie 均未找到，请先在系统 Chrome 中登录 ${platform}`);
    process.exit(1);
  }

  // 保存
  if (!fs.existsSync(COOKIES_DIR)) fs.mkdirSync(COOKIES_DIR, { recursive: true });
  const outPath = path.join(COOKIES_DIR, `${platform}.json`);
  fs.writeFileSync(outPath, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`\n✅ Cookie 已保存至 ${outPath}（共 ${cookies.length} 条，关键 ${requiredFound.length}/${config.requiredCookies.length}）`);
}

const platform = process.argv[2];
if (!platform) {
  console.log('用法: node utils/steal-chrome-session.js <platform>');
  console.log('支持平台: youtube, facebook');
  process.exit(1);
}

extractSession(platform).catch(err => {
  console.error('提取失败:', err.message);
  process.exit(1);
});
