/**
 * 登录辅助工具
 * 用 Playwright 打开平台登录页，等待用户手动登录后提取并保存 Cookie
 */

import { chromium } from 'playwright';
import { saveCookies, getCookieValue } from './cookie.js';
import fs from 'fs';

// 各平台登录配置
const LOGIN_CONFIG = {
  douyin: {
    url: 'https://creator.douyin.com/',
    // 检测登录成功的关键 Cookie
    requiredCookies: ['sessionid'],
    hint: '请在浏览器中完成抖音创作者中心登录（扫码或账号密码）',
  },
  xiaohongshu: {
    url: 'https://creator.xiaohongshu.com/',
    // 小红书创作者中心登录后会颁发 access-token-creator.xiaohongshu.com 这个 Cookie，
    // 注意：不要用 web_session（那是 www.xiaohongshu.com 主站用的，创作者中心不一定有）
    requiredCookies: ['access-token-creator.xiaohongshu.com'],
    hint: '请在浏览器中完成小红书创作者中心登录（扫码）',
  },
  bilibili: {
    url: 'https://passport.bilibili.com/login',
    requiredCookies: ['SESSDATA', 'bili_jct'],
    hint: '请在浏览器中完成B站登录（扫码或账号密码）',
  },
  instagram: {
    url: 'https://www.instagram.com/accounts/login/',
    // 登录成功后 instagram.com 会颁发 sessionid
    requiredCookies: ['sessionid'],
    hint: '请在浏览器中完成 Instagram 登录（账号密码），登录后会自动保存 Cookie',
  },
  facebook: {
    url: 'https://www.facebook.com/login/',
    // 登录成功后 facebook.com 会颁发 c_user 和 xs
    requiredCookies: ['c_user', 'xs'],
    hint: '请在浏览器中完成 Facebook 登录（账号密码），登录后会自动保存 Cookie',
  },
  youtube: {
    url: 'https://accounts.google.com/ServiceLogin?service=youtube',
    // Google/YouTube 登录后会颁发 SID
    requiredCookies: ['SID'],
    hint: '请在浏览器中完成 Google/YouTube 登录（账号密码），登录后会自动保存 Cookie',
  },
  weibo: {
    url: 'https://weibo.com/login.php',
    // 微博登录后会颁发 SUB（主要身份 Cookie）
    requiredCookies: ['SUB'],
    hint: '请在浏览器中完成微博登录（扫码或账号密码）',
  },
  zhihu: {
    url: 'https://www.zhihu.com/creator',
    // 知乎登录后会颁发 z_c0
    requiredCookies: ['z_c0'],
    hint: '请在浏览器中完成知乎登录（扫码或账号密码）',
  },
  tieba: {
    url: 'https://tieba.baidu.com/',
    // 百度登录后会颁发 BDUSS
    requiredCookies: ['BDUSS'],
    hint: '请在浏览器中完成百度贴吧登录（扫码或账号密码）',
  },
};

/**
 * 打开浏览器，等待用户登录并保存 Cookie
 * @param {string} platform
 */
export async function login(platform) {
  const config = LOGIN_CONFIG[platform];
  if (!config) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  console.log(`\n[登录] 正在打开 ${platform} 登录页...`);
  console.log(`[提示] ${config.hint}`);
  console.log('[提示] 登录成功后脚本会自动保存 Cookie，请勿关闭浏览器\n');

  // 有头模式，让用户可以操作
  // 优先使用系统 Edge（Google 不会拦截），其次尝试 Chrome
  const EDGE_EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const useRealBrowser = ['youtube', 'facebook'].includes(platform);
  const launchOptions = { headless: false };
  if (useRealBrowser) {
    if (fs.existsSync(EDGE_EXE)) {
      launchOptions.executablePath = EDGE_EXE;
      console.log('[登录] 使用系统 Microsoft Edge 浏览器');
    } else if (fs.existsSync(CHROME_EXE)) {
      launchOptions.executablePath = CHROME_EXE;
      console.log('[登录] 使用系统 Chrome 浏览器');
    }
  }
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(config.url);

  // 轮询检查关键 Cookie 是否存在（最多等待 5 分钟）
  const maxWait = 300;
  let waited = 0;

  await new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      waited++;
      if (waited > maxWait) {
        clearInterval(interval);
        reject(new Error('等待登录超时（3分钟）'));
        return;
      }

      try {
        const cookies = await context.cookies();
        const allPresent = config.requiredCookies.every(name =>
          getCookieValue(cookies, name)
        );

        if (allPresent) {
          clearInterval(interval);
          // 保存 Cookie
          saveCookies(platform, cookies);
          console.log(`\n[登录] ${platform} 登录成功！`);
          resolve();
        } else {
          process.stdout.write(`\r[等待] 等待登录... ${waited}s`);
        }
      } catch {
        // 页面可能正在导航，忽略错误
      }
    }, 1000);
  });

  await browser.close();
}
