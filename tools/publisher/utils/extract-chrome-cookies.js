/**
 * 从系统 Chrome 的 Cookies 数据库提取指定域名的 cookies
 * 并转换为 Playwright 格式保存到 cookies/ 目录
 *
 * 用法：node utils/extract-chrome-cookies.js youtube
 *       node utils/extract-chrome-cookies.js facebook
 *
 * 注意：运行前请先关闭 Chrome 浏览器（否则数据库被锁定）
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_DIR = path.join(__dirname, '..', 'cookies');

// 平台对应的 Cookie 域名和必需字段
const PLATFORM_CONFIG = {
  youtube: {
    domains: ['.google.com', '.youtube.com', 'accounts.google.com'],
    requiredCookies: ['SID', 'HSID', 'SSID', '__Secure-1PSID'],
  },
  facebook: {
    domains: ['.facebook.com', 'www.facebook.com'],
    requiredCookies: ['c_user', 'xs'],
  },
};

// Chrome Cookies 文件路径
const CHROME_COOKIES_PATH = path.join(
  os.homedir(),
  'AppData/Local/Google/Chrome/User Data/Default/Network/Cookies'
);

// 临时复制路径（Chrome 锁定时无法直接读）
const TEMP_COOKIES = path.join(os.tmpdir(), 'chrome_cookies_copy.db');

async function extractCookies(platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) {
    console.error(`不支持的平台: ${platform}，支持: ${Object.keys(PLATFORM_CONFIG).join(', ')}`);
    process.exit(1);
  }

  if (!fs.existsSync(CHROME_COOKIES_PATH)) {
    console.error(`Chrome Cookies 文件不存在: ${CHROME_COOKIES_PATH}`);
    process.exit(1);
  }

  // 复制 Cookies 文件（避免文件锁）
  console.log(`[提取] 复制 Chrome Cookies 文件...`);
  fs.copyFileSync(CHROME_COOKIES_PATH, TEMP_COOKIES);

  // 用 sqlite3 查询（需要安装 better-sqlite3）
  let Database;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default;
  } catch {
    console.error('需要安装 better-sqlite3：npm install better-sqlite3');
    process.exit(1);
  }

  const db = new Database(TEMP_COOKIES, { readonly: true });

  // 构建域名查询条件
  const domainPlaceholders = config.domains.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT name, value, host_key, path, expires_utc, is_secure, is_httponly, encrypted_value
     FROM cookies
     WHERE host_key IN (${domainPlaceholders})`
  ).all(...config.domains);

  db.close();

  if (rows.length === 0) {
    console.error(`[提取] 未找到 ${platform} 相关 Cookie，请先用 Chrome 登录 ${platform}`);
    process.exit(1);
  }

  // 转换为 Playwright 格式
  // 注意：Chrome 新版 Cookie 值是加密的（encrypted_value），value 字段为空
  // 对于加密 Cookie，需要用 DPAPI 解密，这里先尝试未加密的 value
  const playwrightCookies = rows
    .filter(row => row.value || row.encrypted_value?.length > 0)
    .map(row => ({
      name: row.name,
      value: row.value || '', // 加密的 Cookie value 为空，先保存空值
      domain: row.host_key,
      path: row.path || '/',
      expires: row.expires_utc > 0
        ? Math.floor((row.expires_utc - 11644473600000000) / 1000000) // Chrome epoch -> Unix
        : -1,
      httpOnly: Boolean(row.is_httponly),
      secure: Boolean(row.is_secure),
      sameSite: 'Lax',
    }));

  // 检查必需 Cookie 是否存在
  const found = playwrightCookies.filter(c => config.requiredCookies.includes(c.name));
  console.log(`[提取] 找到 ${rows.length} 个 Cookie，其中关键 Cookie：`);
  for (const name of config.requiredCookies) {
    const cookie = found.find(c => c.name === name);
    if (cookie) {
      console.log(`  ✅ ${name} = ${cookie.value ? cookie.value.substring(0, 20) + '...' : '(加密，值为空)'}`);
    } else {
      console.log(`  ❌ ${name} (未找到)`);
    }
  }

  // 检查是否有加密 Cookie（value 为空但 encrypted_value 非空）
  const encryptedCount = rows.filter(r => !r.value && r.encrypted_value?.length > 0).length;
  if (encryptedCount > 0) {
    console.log(`\n⚠️  有 ${encryptedCount} 个 Cookie 是加密存储的（Chrome 使用 DPAPI 加密）`);
    console.log('   这些 Cookie 的 value 字段为空，需要用 PowerShell 解密。');
    console.log('   请运行：node utils/decrypt-chrome-cookies.js ' + platform);
  }

  // 保存
  if (!fs.existsSync(COOKIES_DIR)) fs.mkdirSync(COOKIES_DIR, { recursive: true });
  const outPath = path.join(COOKIES_DIR, `${platform}.json`);
  fs.writeFileSync(outPath, JSON.stringify(playwrightCookies, null, 2), 'utf-8');
  console.log(`\n[提取] Cookie 已保存至 ${outPath}（共 ${playwrightCookies.length} 条）`);

  // 清理临时文件
  fs.unlinkSync(TEMP_COOKIES);
}

const platform = process.argv[2];
if (!platform) {
  console.log('用法: node utils/extract-chrome-cookies.js <platform>');
  console.log('支持平台: youtube, facebook');
  process.exit(1);
}

extractCookies(platform).catch(err => {
  console.error('提取失败:', err.message);
  process.exit(1);
});
