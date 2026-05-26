/**
 * YouTube 社区帖子图文发布模块
 * 桥接层：调用 youtube.py（CloakBrowser 反检测版）
 *
 * 为什么用 Python：Google 对 Playwright 自动化检测极为严格，
 * CloakBrowser 能有效绕过 Google 的机器人检测。
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = path.join(__dirname, 'youtube.py');

export async function publish({ title, desc, images }) {
  console.log('[YouTube] 开始发布社区帖子（CloakBrowser 版）...');

  const imagesStr = (images || []).join(',');

  // 转义参数中的双引号，避免 shell 注入
  const safeTitle = (title || '').replace(/"/g, '\\"');
  const safeDesc = (desc || '').replace(/"/g, '\\"');
  const safeImages = imagesStr.replace(/"/g, '\\"');

  const cmd = `python "${PY_SCRIPT}" --title "${safeTitle}" --desc "${safeDesc}" --images "${safeImages}"`;

  console.log('[YouTube] 调用 CloakBrowser Python 脚本...');

  try {
    const output = execSync(cmd, {
      cwd: path.join(__dirname, '..'),
      timeout: 300000, // 5分钟超时
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 输出 Python 脚本的日志
    if (output) {
      output.split('\n').forEach(line => {
        if (line.trim()) console.log(line);
      });
    }

    return { success: true, platform: 'youtube' };

  } catch (err) {
    // execSync 失败时 stderr 和 stdout 在 err 对象上
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    if (stdout) stdout.split('\n').forEach(line => { if (line.trim()) console.log(line); });
    if (stderr) stderr.split('\n').forEach(line => { if (line.trim()) console.error(line); });
    throw new Error(`[YouTube] Python 脚本执行失败: ${err.message}`);
  }
}
