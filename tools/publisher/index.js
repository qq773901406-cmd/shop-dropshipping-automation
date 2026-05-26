/**
 * 多平台图文一键发布工具
 *
 * 用法：
 *   # 首次登录
 *   node index.js --login --platforms douyin
 *   node index.js --login --platforms xiaohongshu
 *   node index.js --login --platforms bilibili
 *
 *   # 发布到所有平台
 *   node index.js --title "标题" --desc "描述" --images "a.jpg,b.jpg" --platforms all
 *
 *   # 发布到指定平台
 *   node index.js --title "标题" --desc "描述" --images "a.jpg,b.jpg" --platforms douyin,xiaohongshu
 */

import { Command } from 'commander';
import { login } from './utils/login.js';
import { publish as douyinPublish } from './platforms/douyin.js';
import { publish as xhsPublish } from './platforms/xiaohongshu.js';
import { publish as biliPublish } from './platforms/bilibili.js';
import { publish as weiboPublish } from './platforms/weibo.js';
import { publish as zhihuPublish } from './platforms/zhihu.js';
import { publish as igPublish } from './platforms/instagram.js';
import { publish as fbPublish } from './platforms/facebook.js';
import { publish as ytPublish } from './platforms/youtube.js';

// 国内平台
const CN_PLATFORMS = ['douyin', 'xiaohongshu', 'bilibili', 'weibo', 'zhihu'];
// 国外平台
const INTL_PLATFORMS = ['instagram', 'facebook', 'youtube'];
// 全部平台
const ALL_PLATFORMS = [...CN_PLATFORMS, ...INTL_PLATFORMS];

const PUBLISHERS = {
  douyin: douyinPublish,
  xiaohongshu: xhsPublish,
  bilibili: biliPublish,
  weibo: weiboPublish,
  zhihu: zhihuPublish,
  instagram: igPublish,
  facebook: fbPublish,
  youtube: ytPublish,
};

const program = new Command();

program
  .name('publisher')
  .description('多平台图文一键发布工具（抖音、小红书、B站、微博、知乎、Instagram、Facebook、YouTube）')
  .version('2.0.0');

program
  .option('--login', '登录模式：打开浏览器等待手动登录并保存 Cookie')
  .option('--title <title>', '发布标题')
  .option('--desc <desc>', '发布描述', '')
  .option('--images <images>', '图片路径，多张用英文逗号分隔')
  .option('--platforms <platforms>', '目标平台，多个用逗号分隔，或填 all / cn（国内）/ intl（国外）', 'all')
  .parse(process.argv);

const opts = program.opts();

// 解析平台列表
function parsePlatforms(input) {
  if (input === 'all') return ALL_PLATFORMS;
  if (input === 'cn') return CN_PLATFORMS;
  if (input === 'intl') return INTL_PLATFORMS;
  return input.split(',').map(p => p.trim()).filter(p => ALL_PLATFORMS.includes(p));
}

async function main() {
  const platforms = parsePlatforms(opts.platforms);

  if (platforms.length === 0) {
    console.error('错误：未指定有效平台，可选：douyin, xiaohongshu, bilibili, weibo, zhihu, instagram, facebook, youtube, all, cn, intl');
    process.exit(1);
  }

  // 登录模式
  if (opts.login) {
    for (const platform of platforms) {
      await login(platform);
    }
    console.log('\n所有平台登录完成！');
    return;
  }

  // 发布模式
  if (!opts.title && !opts.desc) {
    console.error('错误：发布时需要提供 --title 或 --desc');
    process.exit(1);
  }

  if (!opts.images) {
    console.error('错误：发布时需要提供 --images 图片路径');
    process.exit(1);
  }

  const images = opts.images.split(',').map(p => p.trim());
  const publishOptions = {
    title: opts.title || '',
    desc: opts.desc || '',
    images,
  };

  console.log(`\n发布配置：`);
  console.log(`  标题：${publishOptions.title}`);
  console.log(`  描述：${publishOptions.desc}`);
  console.log(`  图片：${images.join(', ')}`);
  console.log(`  平台：${platforms.join(', ')}\n`);

  // 并发发布到各平台
  const results = await Promise.allSettled(
    platforms.map(platform => {
      const publishFn = PUBLISHERS[platform];
      if (!publishFn) {
        return Promise.reject(new Error(`不支持的平台: ${platform}`));
      }
      return publishFn(publishOptions);
    })
  );

  // 汇总结果
  console.log('\n========== 发布结果 ==========');
  platforms.forEach((platform, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      console.log(`✅ ${platform}: 发布成功`);
    } else {
      console.error(`❌ ${platform}: 发布失败 - ${result.reason?.message || result.reason}`);
    }
  });
  console.log('==============================\n');
}

main().catch(err => {
  console.error('程序异常:', err);
  process.exit(1);
});
