/**
 * 数据可视化卡片生成器
 * 读取每日选品分析数据，生成 11 张 1080x1080 PNG 卡片
 *
 * 用法：
 *   node index.js --date 2026-05-18
 *   node index.js  （不传 date 默认今天）
 *
 * 输出：
 *   D:/Product/发布到各个平台图.png    — 10张商品卡片合并封面图
 *   D:/Product/发布到各个平台图2.png   — TOP1 单品详情
 *   ...
 *   D:/Product/发布到各个平台图9.png   — TOP8 单品详情
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.join(__dirname, '../../output');
const SCREENSHOTS_DIR = path.join(__dirname, '../../');

// ─── 命令行参数 ───────────────────────────────────────────────
const args = process.argv.slice(2);
const dateArg = args[args.indexOf('--date') + 1];
const TODAY = dateArg || new Date().toISOString().slice(0, 10);

// ─── 数据解析 ─────────────────────────────────────────────────

function parsePrice(md) {
  const get = (pattern) => {
    const m = md.match(pattern);
    return m ? m[1].trim() : '—';
  };
  return {
    cost:       get(/货源成本\s*\|\s*(\$[\d.]+)/),
    price:      get(/\|\s*\*\*建议定价\*\*\s*\|\s*\*\*(\$[\d.]+)\*\*/),
    profit:     get(/\|\s*\*\*每单毛利\*\*\s*\|\s*\*\*(\$[\d.]+)\*\*/),
    marginStr:  get(/\|\s*\*\*毛利率\*\*\s*\|\s*\*\*([\d.]+%)\*\*/),
    margin:     parseFloat((get(/\|\s*\*\*毛利率\*\*\s*\|\s*\*\*([\d.]+)%\*\*/) || '0').replace(/[^\d.]/g, '')) || 0,
    conservative: get(/保守\s*\|\s*\d+单\s*\|\s*\d+单\s*\|\s*(\$[\d,.]+)/),
    moderate:     get(/中等\s*\|\s*\d+单\s*\|\s*\d+单\s*\|\s*(\$[\d,.]+)/),
    optimistic:   get(/乐观\s*\|\s*\d+单\s*\|\s*\d+单\s*\|\s*(\$[\d,.]+)/),
  };
}

function parseAnalysis(md) {
  // 取热门话题——格式 "#tag (XX.X亿播放)" 或 "| #tag | XX.X亿播放 |"
  // 先尝试括号格式：#waterbottle (28.4亿播放)
  const tagMatches1 = [...md.matchAll(/(#\w+)\s*\(([\d.]+)([亿万]+)播放\)/g)];
  // 再尝试表格格式：| #tag | XX.X亿播放 |
  const tagMatches2 = [...md.matchAll(/\|\s*(#\w+)\s*\|\s*([\d.]+)([亿万]+)播放/g)];
  const tagMatches = [...tagMatches1, ...tagMatches2];

  let topTag = '', topPlays = '', topPlaysNum = 0;
  for (const m of tagMatches) {
    const num = parseFloat(m[2]) * (m[3] === '亿' ? 1e8 : 1e4);
    if (num > topPlaysNum) { topPlaysNum = num; topTag = m[1]; topPlays = m[2] + m[3]; }
  }

  // 提取所有话题（最多2个展示在话题卡片区，3个在左侧标签区）
  const allTags = [...new Set(tagMatches.map(m => m[1]))].slice(0, 3);

  // 综合结论
  const conclusionLine = (md.match(/\*\*结论\*\*[：:](.+)/) || [])[1] || '';
  const isGood = conclusionLine.includes('✅') || (md.includes('✅') && !conclusionLine.includes('⚠️'));
  const conclusion = isGood ? '✅ 推荐' : '⚠️ 谨慎';

  // TikTok 内容适配星级
  const starMatch = md.match(/TikTok内容适配\s*\|\s*(⭐+)/);
  const stars = starMatch ? starMatch[1].length : 3;

  // 竞争密度：🔴 红海 / 🟡 中等 / 🟢 蓝海
  let competition = '🟡 中等';
  if (md.includes('🔴')) competition = '🔴 红海';
  else if (md.includes('🟢')) competition = '🟢 蓝海';

  // 货源平台（从分析文件里取）
  const supplierMatch = md.match(/\*\*供应商\*\*[：:]\s*(.+)/);
  const supplier = supplierMatch ? supplierMatch[1].trim() : 'Temu美国仓';

  // 钩子话术（提取所有英文引号内容）
  const hookMatches = [...md.matchAll(/"([^"]{8,80})"/g)].map(m => m[1]);
  const hook = hookMatches[0] || '';
  const hooks = hookMatches.slice(0, 3); // 最多3条钩子

  // 受众画像
  const audienceMatch = md.match(/受众画像\s*\|\s*(.+)/);
  const audience = audienceMatch ? audienceMatch[1].trim().replace(/\*\*/g, '').substring(0, 30) : '';

  return { tag: topTag, plays: topPlays, allTags, conclusion, stars, competition, supplier, hook, hooks, audience };
}

function findProductImage(pDir) {
  // 尝试找商品图片
  const imgDir = path.join(pDir, '06_素材', 'images');
  if (!fs.existsSync(imgDir)) return null;
  const files = fs.readdirSync(imgDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (!files.length) return null;
  // 优先货源图，其次场景图
  const src = files.find(f => f.startsWith('货源')) || files[0];
  const imgPath = path.join(imgDir, src);
  const data = fs.readFileSync(imgPath);
  const ext = path.extname(src).slice(1).toLowerCase().replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${data.toString('base64')}`;
}

function loadProducts(date) {
  const dir = path.join(OUTPUT_ROOT, date);
  if (!fs.existsSync(dir)) throw new Error(`输出目录不存在: ${dir}`);
  const products = [];
  for (const name of fs.readdirSync(dir)) {
    const pDir = path.join(dir, name);
    if (!fs.statSync(pDir).isDirectory()) continue;
    const priceMd    = path.join(pDir, '03_价格单.md');
    const analysisMd = path.join(pDir, '01_全链路分析.md');
    if (!fs.existsSync(priceMd) || !fs.existsSync(analysisMd)) continue;
    const price    = parsePrice(fs.readFileSync(priceMd, 'utf8'));
    const analysis = parseAnalysis(fs.readFileSync(analysisMd, 'utf8'));
    const imgData  = findProductImage(pDir);
    products.push({ name, ...price, ...analysis, imgData });
  }
  products.sort((a, b) => b.margin - a.margin);
  return products;
}

// ─── 颜色常量 ─────────────────────────────────────────────────
const BG     = '#0a0e1a';
const BLUE   = '#4fc3f7';
const ORANGE = '#ff9800';
const GREEN  = '#66bb6a';
const RED    = '#ef5350';
const TEXT   = '#e0e0e0';
const MUTED  = '#8899aa';
const CARD   = '#151d2e';
const CARD2  = '#1a2236';

/** 第1张：10款选品排行榜封面图 */
function htmlCover(products, date) {
  const maxMargin = Math.max(...products.map(p => p.margin));

  const rows = products.slice(0, 10).map((p, i) => {
    const barW      = Math.round((p.margin / maxMargin) * 88);
    const color     = i === 0 ? ORANGE : i < 3 ? BLUE : MUTED;
    const medal     = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const compColor = p.competition.includes('🔴') ? RED : p.competition.includes('🟢') ? GREEN : ORANGE;
    const compLabel = p.competition.includes('🔴') ? '红海' : p.competition.includes('🟢') ? '蓝海' : '中等';
    const marginColor = p.margin >= 70 ? GREEN : p.margin >= 60 ? ORANGE : BLUE;

    const imgBlock = p.imgData
      ? `<img src="${p.imgData}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid #1e2d45"/>`
      : `<div style="width:44px;height:44px;border-radius:8px;background:#1a2236;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;border:1px solid #1e2d45">${medal}</div>`;

    return `
      <div style="display:flex;align-items:center;gap:14px;background:${CARD};border-radius:12px;padding:12px 18px;border:1px solid #1a2640">
        <div style="width:32px;font-size:20px;text-align:center;flex-shrink:0">${medal}</div>
        ${imgBlock}
        <div style="width:180px;flex-shrink:0">
          <div style="font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:12px;color:${MUTED};margin-top:2px">${p.price}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:5px">
          <div style="height:7px;background:#1e2d45;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${barW}%;background:${color};border-radius:4px"></div>
          </div>
        </div>
        <div style="padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;flex-shrink:0;
          background:${p.competition.includes('🔴') ? 'rgba(239,83,80,0.15)' : p.competition.includes('🟢') ? 'rgba(102,187,106,0.15)' : 'rgba(255,152,0,0.15)'};
          color:${compColor};border:1px solid ${compColor}">${compLabel}</div>
        <div style="width:72px;text-align:right;font-size:22px;font-weight:700;color:${marginColor};flex-shrink:0">${p.marginStr}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;background:${BG};color:${TEXT};
  font-family:'PingFang SC','Microsoft YaHei',sans-serif;overflow:hidden;display:flex;flex-direction:column}
.header{padding:38px 52px 22px;border-bottom:1px solid #1e2d45;flex-shrink:0}
.logo{font-size:13px;color:${MUTED};letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}
.title{font-size:40px;font-weight:700;color:#fff;line-height:1.15}
.title span{color:${BLUE}}
.subtitle{margin-top:6px;font-size:15px;color:${MUTED}}
.list{flex:1;padding:18px 52px 12px;display:flex;flex-direction:column;gap:9px}
.footer{height:46px;padding:0 52px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #1e2d45;flex-shrink:0}
.ft-l{font-size:12px;color:${MUTED}}
.ft-r{font-size:12px;color:${MUTED}}
.tag{display:inline-block;padding:2px 9px;border-radius:20px;background:#1e2d45;color:${BLUE};font-size:11px;margin-left:5px}
</style></head><body>
<div class="header">
  <div class="logo">TikTok Shop · 无货源代发</div>
  <div class="title">今日 <span>选品日报</span> · 毛利率排行榜</div>
  <div class="subtitle">${date} · 全品类覆盖：小商品 / 服装 / 鞋子 / 包包配饰 · 共 ${products.length} 款</div>
</div>
<div class="list">${rows}</div>
<div class="footer">
  <div class="ft-l">按毛利率降序 · TOP10 精选 · 🟢蓝海 🟡中等 🔴红海</div>
  <div class="ft-r"><span class="tag">#跨境电商</span><span class="tag">#TikTokShop</span><span class="tag">#选品日报</span></div>
</div>
</body></html>`;
}

/** 第2-11张：单品详情卡（左图右数据） */
function htmlDetail(p, rank, date) {
  const r    = 58;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(p.margin / 100, 1);
  const dash = circ * pct;
  const marginColor = p.margin >= 70 ? GREEN : p.margin >= 60 ? ORANGE : BLUE;
  const rankEmoji   = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  const compColor   = p.competition.includes('🔴') ? RED : p.competition.includes('🟢') ? GREEN : ORANGE;

  // 月收益行
  const monthRows = [
    { label: '保守', val: p.conservative },
    { label: '中等', val: p.moderate },
    { label: '乐观', val: p.optimistic },
  ].filter(r => r.val && r.val !== '—').map((r, i) => `
    <div class="mrow">
      <span class="mlabel">${r.label}</span>
      <span class="mval" style="color:${i === 2 ? GREEN : i === 1 ? ORANGE : BLUE}">${r.val}<small>/月</small></span>
    </div>`).join('');

  // TikTok星级
  const stars = '⭐'.repeat(p.stars) + '☆'.repeat(Math.max(0, 5 - p.stars));

  // 图片区域：有图用图，无图用钩子话术填满
  const hooksHtml = (p.hooks && p.hooks.length > 0)
    ? p.hooks.map((h, i) => `
        <div style="padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid ${i===0?ORANGE:i===1?BLUE:GREEN}">
          <div style="font-size:11px;color:${i===0?ORANGE:i===1?BLUE:GREEN};margin-bottom:6px;letter-spacing:1.5px;font-weight:600">HOOK ${i+1}</div>
          <div style="font-size:13px;color:#e0e0e0;line-height:1.55;font-style:italic">"${h.length > 60 ? h.substring(0,60)+'…' : h}"</div>
        </div>`).join('')
    : `<div style="font-size:14px;color:${MUTED}">暂无话术数据</div>`;

  const imgBlock = p.imgData
    ? `<img src="${p.imgData}" style="width:100%;height:100%;object-fit:contain;border-radius:0;background:#0d1525"/>`
    : `<div style="width:100%;height:100%;display:flex;flex-direction:column;padding:16px 16px 12px;background:linear-gradient(160deg,#1a2236 0%,#0d1525 100%);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:11px;color:${MUTED};letter-spacing:2px;text-transform:uppercase">TikTok Hook 话术</div>
          <div style="padding:4px 12px;border-radius:14px;font-size:12px;font-weight:700;
            background:${p.competition.includes('🔴') ? 'rgba(239,83,80,0.15)' : p.competition.includes('🟢') ? 'rgba(102,187,106,0.15)' : 'rgba(255,152,0,0.15)'};
            color:${compColor};border:1px solid ${compColor}">${p.competition}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;flex:1;overflow:hidden;min-height:0;justify-content:space-evenly">
          ${hooksHtml}
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #1e2d45;flex-shrink:0">
          <div style="font-size:11px;color:${MUTED};margin-bottom:6px;letter-spacing:1px">热门话题</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(p.allTags||[p.tag]).filter(Boolean).map(t=>`<span style="padding:3px 10px;border-radius:12px;background:#1e2d45;color:${BLUE};font-size:12px;font-weight:500">${t}</span>`).join('')}
          </div>
        </div>
       </div>`;

  // 钩子话术（底部叠加，仅有图时显示）
  const hookHtml = p.imgData && p.hook
    ? `<div class="hook">"${p.hook.length > 45 ? p.hook.substring(0,45)+'…' : p.hook}"</div>`
    : '';

  // 话题播放量详情——紧凑列表格式 + 搜索趋势描述块
  const tagDetailItems = (p.allTags || []).filter(Boolean);
  const tagsDetailHtml = tagDetailItems.length > 0
    ? `<div style="display:flex;flex-direction:column;gap:8px">
        ${tagDetailItems.slice(0, 3).map((t, i) => {
          const colors = [ORANGE, BLUE, GREEN];
          const isTop = i === 0 && p.plays;
          return `<div style="display:flex;align-items:center;justify-content:space-between;
            padding:10px 16px;background:rgba(255,255,255,0.04);border-radius:8px;
            border-left:3px solid ${colors[i%3]}">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="padding:3px 12px;border-radius:12px;background:#1e2d45;color:${colors[i%3]};font-size:13px;font-weight:500">${t}</span>
              <span style="font-size:12px;color:#556677">${isTop ? '最热话题' : '关联话题'}</span>
            </div>
            ${isTop ? `<span style="font-size:15px;font-weight:700;color:${ORANGE}">${p.plays}<span style="font-size:11px;color:${MUTED};font-weight:400"> 播放</span></span>` : `<span style="font-size:12px;color:#445566">#${i + 1}</span>`}
          </div>`;
        }).join('')}
       </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;background:${BG};color:${TEXT};
  font-family:'PingFang SC','Microsoft YaHei',sans-serif;overflow:hidden;
  display:flex;flex-direction:column}

/* ── 顶部标题栏 ── */
.topbar{height:80px;padding:0 40px;display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid #1e2d45;flex-shrink:0}
.topbar-left{display:flex;flex-direction:column;gap:4px}
.topbar-logo{font-size:12px;color:${MUTED};letter-spacing:2px;text-transform:uppercase}
.topbar-name{font-size:26px;font-weight:700;color:#fff;max-width:560px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar-right{display:flex;align-items:center;gap:12px}
.rank-badge{font-size:36px}
.badge{padding:5px 16px;border-radius:20px;font-size:13px;font-weight:600;
  background:${p.conclusion.includes('✅') ? '#1a3a1a' : '#3a2000'};
  color:${p.conclusion.includes('✅') ? GREEN : ORANGE};
  border:1px solid ${p.conclusion.includes('✅') ? GREEN : ORANGE}}

/* ── 主体：左图 + 右数据 ── */
.main{flex:1;display:flex;overflow:hidden}

/* 左侧图片区 */
.img-col{width:460px;flex-shrink:0;position:relative;overflow:hidden;background:#0d1525}
.img-overlay{position:absolute;bottom:0;left:0;right:0;padding:16px 18px;
  background:linear-gradient(transparent, rgba(0,0,0,0.85))}
.hook{font-size:14px;color:#fff;font-style:italic;line-height:1.5;opacity:.9}
.comp-badge{position:absolute;top:14px;left:14px;padding:5px 14px;border-radius:20px;
  font-size:13px;font-weight:700;
  background:${p.competition.includes('🔴') ? 'rgba(239,83,80,0.2)' : p.competition.includes('🟢') ? 'rgba(102,187,106,0.2)' : 'rgba(255,152,0,0.2)'};
  color:${compColor};border:1px solid ${compColor}}

/* 右侧数据区 */
.data-col{flex:1;display:flex;flex-direction:column;gap:0;overflow:hidden;min-height:0}

/* 数据行1：成本定价 */
.data-row{padding:0 28px;border-bottom:1px solid #1e2d45;height:28%;display:flex;flex-direction:column;justify-content:center}
.section-title{font-size:11px;color:${MUTED};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px}
.price-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.price-item .lbl{font-size:12px;color:${MUTED};margin-bottom:3px}
.price-item .val{font-size:24px;font-weight:700}

/* 数据行2：毛利率+月收益 */
.profit-row{padding:0 28px;border-bottom:1px solid #1e2d45;height:28%;
  display:flex;align-items:center;gap:20px}
.ring-wrap{position:relative;width:110px;height:110px;flex-shrink:0}
.ring-wrap svg{transform:rotate(-90deg)}
.ring-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
.ring-pct{font-size:26px;font-weight:700;color:${marginColor};line-height:1}
.ring-lbl{font-size:10px;color:${MUTED};margin-top:2px}
.month-info{flex:1}
.mrow{display:flex;justify-content:space-between;align-items:center;
  padding:7px 0;border-bottom:1px solid #111827}
.mrow:last-child{border:none}
.mlabel{font-size:13px;color:${MUTED}}
.mval{font-size:18px;font-weight:700}
.mval small{font-size:11px;color:${MUTED};font-weight:400}

/* 数据行3：TikTok热度 */
.tiktok-row{padding:0 28px 0;flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;justify-content:center}
.tiktok-inner{display:flex;gap:20px;align-items:flex-start}
.tiktok-tag-block{}
.tiktok-tag{display:inline-block;padding:4px 14px;border-radius:20px;background:#1e2d45;color:${BLUE};font-size:14px;margin-bottom:6px}
.tiktok-plays{font-size:28px;font-weight:700;color:${ORANGE};line-height:1}
.tiktok-plays-lbl{font-size:11px;color:${MUTED};margin-top:3px}
.tiktok-right{flex:1;display:flex;flex-direction:column;gap:10px}
.stars-row{display:flex;align-items:center;gap:8px}
.stars-lbl{font-size:12px;color:${MUTED}}
.stars{font-size:18px}
.supplier-row{font-size:13px;color:${MUTED}}
.supplier-row span{color:${BLUE}}
.audience-row{font-size:13px;color:${MUTED}}
.audience-row span{color:${TEXT}}

/* 底部 */
.footer{height:44px;padding:0 40px;display:flex;justify-content:space-between;align-items:center;
  border-top:1px solid #1e2d45;flex-shrink:0}
.ft-l{font-size:12px;color:${MUTED}}
.ft-r{font-size:12px;color:${MUTED}}
</style></head><body>

<div class="topbar">
  <div class="topbar-left">
    <div class="topbar-logo">TikTok Shop · 无货源代发 · ${date}</div>
    <div class="topbar-name">${p.name}</div>
  </div>
  <div class="topbar-right">
    <div class="badge">${p.conclusion}</div>
    <div class="rank-badge">${rankEmoji}</div>
  </div>
</div>

<div class="main">
  <!-- 左侧图片 -->
  <div class="img-col">
    ${imgBlock}
    ${p.imgData ? `<div class="comp-badge">${p.competition}</div>` : ''}
    <div class="img-overlay">${hookHtml}</div>
  </div>

  <!-- 右侧数据 -->
  <div class="data-col">

    <!-- 成本 & 定价 -->
    <div class="data-row">
      <div class="section-title">💰 成本 &amp; 定价</div>
      <div class="price-grid">
        <div class="price-item">
          <div class="lbl">货源成本</div>
          <div class="val" style="color:${MUTED};font-size:20px">${p.cost}</div>
        </div>
        <div class="price-item">
          <div class="lbl">建议定价</div>
          <div class="val" style="color:${BLUE}">${p.price}</div>
        </div>
        <div class="price-item">
          <div class="lbl">每单毛利</div>
          <div class="val" style="color:${GREEN}">${p.profit}</div>
        </div>
        <div class="price-item">
          <div class="lbl">毛利率</div>
          <div class="val" style="color:${marginColor}">${p.marginStr}</div>
        </div>
      </div>
    </div>

    <!-- 毛利率环 + 月收益 -->
    <div class="profit-row">
      <div class="ring-wrap">
        <svg width="110" height="110" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="${r}" fill="none" stroke="#1e2d45" stroke-width="13"/>
          <circle cx="60" cy="60" r="${r}" fill="none" stroke="${marginColor}" stroke-width="13"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <div class="ring-center">
          <div class="ring-pct">${p.marginStr}</div>
          <div class="ring-lbl">毛利率</div>
        </div>
      </div>
      <div class="month-info">
        <div class="section-title">📈 月收益预估</div>
        ${monthRows || '<div style="color:#8899aa;font-size:14px">暂无数据</div>'}
      </div>
    </div>

    <!-- TikTok 热度 -->
    <div class="tiktok-row">
      <div class="section-title">🔥 TikTok 市场热度</div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-evenly;min-height:0">
        <div style="display:flex;gap:20px;align-items:flex-start">
          <div>
            ${p.tag ? `<div class="tiktok-tag">${p.tag}</div>` : ''}
            ${p.plays ? `<div class="tiktok-plays">${p.plays}</div><div class="tiktok-plays-lbl">最高话题播放量</div>` : ''}
          </div>
          <div class="tiktok-right">
            <div class="stars-row">
              <div class="stars-lbl">内容适配</div>
              <div class="stars">${stars}</div>
            </div>
            <div class="supplier-row">货源：<span>${p.supplier}</span></div>
            ${p.audience ? `<div class="audience-row">受众：<span>${p.audience}</span></div>` : ''}
          </div>
        </div>
        ${tagsDetailHtml ? `<div style="border-top:1px solid #1e2d45;padding-top:14px">${tagsDetailHtml}</div>` : ''}
      </div>
    </div>

  </div>
</div>

<div class="footer">
  <div class="ft-l">毛利率排名 TOP${rank} · 选品日报 ${date}</div>
  <div class="ft-r">#跨境电商 #TikTokShop #选品日报 #无货源代发</div>
</div>

</body></html>`;
}

// ─── 主流程 ───────────────────────────────────────────────────

async function main() {
  console.log(`[卡片生成] 读取 ${TODAY} 选品数据...`);
  const products = loadProducts(TODAY);
  console.log(`[卡片生成] 共解析 ${products.length} 款商品`);

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  const outputs = [
    { name: '合并封面图', html: htmlCover(products, TODAY), file: '发布到各个平台图.png' },
    ...products.slice(0, 8).map((p, i) => ({
      name: `TOP${i + 1} ${p.name}`,
      html: htmlDetail(p, i + 1, TODAY),
      file: `发布到各个平台图${i + 2}.png`,
    })),
  ];

  for (const item of outputs) {
    console.log(`[卡片生成] 生成: ${item.name}...`);
    await page.setViewportSize({ width: 1080, height: 1080 });
    await page.setContent(item.html, { waitUntil: 'networkidle' });
    const outPath = path.join(SCREENSHOTS_DIR, item.file);
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`[卡片生成] ✅ 已保存: ${outPath}`);
  }

  await browser.close();
  console.log(`\n[卡片生成] 全部完成！共生成 ${outputs.length} 张卡片（1张合并封面 + ${outputs.length - 1}张单品详情）`);
}

main().catch(err => {
  console.error('[卡片生成] 错误:', err);
  process.exit(1);
});
