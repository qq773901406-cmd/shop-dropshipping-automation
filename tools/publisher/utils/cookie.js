/**
 * Cookie 持久化工具
 * 负责各平台 Cookie 的读取、保存和校验
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_DIR = path.join(__dirname, '..', 'cookies');

// 确保 cookies 目录存在
if (!fs.existsSync(COOKIES_DIR)) {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
}

/**
 * 保存平台 Cookie 到文件
 * @param {string} platform - 平台名称（douyin / xiaohongshu / bilibili）
 * @param {Array} cookies - Playwright cookies 数组
 */
export function saveCookies(platform, cookies) {
  const filePath = path.join(COOKIES_DIR, `${platform}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`[Cookie] ${platform} Cookie 已保存至 ${filePath}`);
}

/**
 * 读取平台 Cookie
 * @param {string} platform
 * @returns {Array|null} cookies 数组，不存在返回 null
 */
export function loadCookies(platform) {
  const filePath = path.join(COOKIES_DIR, `${platform}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 将 Playwright cookies 数组转为请求头 Cookie 字符串
 * @param {Array} cookies
 * @returns {string}
 */
export function cookiesToString(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

/**
 * 从 cookies 数组中提取指定名称的值
 * @param {Array} cookies
 * @param {string} name
 * @returns {string|null}
 */
export function getCookieValue(cookies, name) {
  const cookie = cookies.find(c => c.name === name);
  return cookie ? cookie.value : null;
}

/**
 * 检查 Cookie 文件是否存在
 * @param {string} platform
 * @returns {boolean}
 */
export function hasCookies(platform) {
  return fs.existsSync(path.join(COOKIES_DIR, `${platform}.json`));
}
