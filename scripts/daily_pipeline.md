# 每日选品日报流水线

每次新开会话后，用以下命令重新注册定时任务：
- 工具：CronCreate
- cron: `0 9 * * *`
- recurring: true
- prompt: 见下方 CronCreate Prompt 模板

---

## CronCreate Prompt 模板

```
执行今日跨境电商选品日报全流程，TODAY = 今天日期（格式 YYYY-MM-DD）：

## Step 1：选品全链路分析
调用跨境电商无货源代发全链路分析技能（D:/Product/skills/cross-border-ecommerce/SKILL.md），自动选出10款商品：
- 爆款小商品（家居/厨房/数码等）：4款
- 女装/男装/童装：2款
- 鞋子：2款
- 包包/配饰：2款

每款完整输出6个文件到 D:/Product/output/{TODAY}/{商品名}/：
- 01_全链路分析.md
- 02_货源比价.md
- 03_价格单.md
- 04_视频脚本.md
- 05_发布文案.md（国内平台中文版 + 国外平台英文版，分开独立写）
- 06_素材/images/（目录占位，图片由Step 2填充）

不询问用户，直接执行到底。跳过 D:/Product/output/ 中已有文件夹的商品名。

## Step 2：使用 fetch_product_imgs.py + CloakBrowser 下载图片
唯一正确命令：
  python D:/Product/fetch_product_imgs.py {TODAY}

执行前检查：若 fetch_product_imgs.py 的 NAME_TO_EN 字典中缺少当日商品的关键词映射，先追加进去再运行。
等待脚本执行完成，图片下载到各商品的 06_素材/images/ 目录。
命名规则：产品_01.jpg / 产品_02.jpg（每款2张）
严禁替代方案：百度图片 / Pexels / Unsplash / playwright-cli run-code / curl 硬编码URL

## Step 3：生成发布到各个平台图
执行命令：
  cd "D:/Product/tools/card-generator" && node index.js --date {TODAY}

生成9张PNG到 D:/Product/：
- 发布到各个平台图.png（封面汇总）
- 发布到各个平台图2.png ~ 发布到各个平台图9.png（单品详情，每款1张）

## Step 4：发布到8个平台
图片列表（共9张）：D:/Product/发布到各个平台图.png, 发布到各个平台图2.png, ..., 发布到各个平台图9.png

国内4个平台（中文文案）：
  cd "D:/Product/tools/publisher" && node index.js \
    --title "{TODAY} 跨境选品日报" \
    --desc "{从各商品05_发布文案.md提取中文版内容合并}" \
    --images "D:/Product/发布到各个平台图.png,..." \
    --platforms "douyin,xiaohongshu,bilibili,zhihu,weibo"

国外3个平台（英文文案）：
  cd "D:/Product/tools/publisher" && node index.js \
    --title "{TODAY} TikTok Shop Product Selection Report" \
    --desc "{从各商品05_发布文案.md提取英文版内容合并}" \
    --images "D:/Product/发布到各个平台图.png,发布到各个平台图2.png,发布到各个平台图3.png,发布到各个平台图4.png,发布到各个平台图5.png,发布到各个平台图6.png,发布到各个平台图7.png,发布到各个平台图8.png,发布到各个平台图9.png" \
    --platforms "instagram,facebook,youtube"

两条命令并发执行，不能只发其中一部分。

## Step 5：打包压缩并发到企微
1. 打包当日输出目录：
   python -c "import shutil; shutil.make_archive('D:/Product/output/选品日报_{TODAY}', 'zip', 'D:/Product/output/{TODAY}')"

2. 用 WeComReply 发送 zip 文件（chat_id: wecom_wrkSFfCgAAPS9af8JJwjky_v_PSKJbtg_T75340040A）：
   WeComReply file_path="D:/Product/output/选品日报_{TODAY}.zip"

3. 用 WeComReply 发送汇总文字（详细选品日报）：
   内容包含：选品日报标题、日期、10款商品名称及核心数据（售价/成本/毛利率/月销量）、优先上架前3名建议
```

---

## 流程图

```
09:00 CronCreate 触发
    ↓
Step 1  选品全链路分析      → D:/Product/output/YYYY-MM-DD/（10款，6个文件/款）
    ↓
Step 2  fetch_product_imgs.py + CloakBrowser → 各商品 06_素材/images/
    ↓
Step 3  card-generator      → 发布到各个平台图.png ~ 发布到各个平台图9.png
    ↓
Step 4  publisher           → 抖音/小红书/B站/知乎/微博（中文）+ Instagram/Facebook/YouTube（英文）
    ↓
Step 5  zip + WeComReply    → 企微群（zip压缩包 + 利润汇总文字）
```

---

## 平台发布说明

| 平台 | 语言 | 图片数量 |
|------|------|----------|
| 抖音 | 中文 | 9张（封面+商品1~8） |
| 小红书 | 中文 | 9张 |
| B站 | 中文 | 9张 |
| 知乎 | 中文 | 9张 |
| 微博 | 中文 | 9张 |
| Instagram | 英文 | 9张 |
| Facebook | 英文 | 9张 |
| YouTube | 英文 | 9张 |

> 发布到各个平台图1~9共9张，封面1张+单品8张

---

## 企微发送说明

- **chat_id**：`wecom_wrkSFfCgAAPS9af8JJwjky_v_PSKJbtg_T75340040A`
- **发送内容**：
  1. zip 压缩包（当日完整分析文档）
  2. 文字汇总：10款商品利润对比 + 优先上架前3名建议

---

## 注意事项

- CronCreate 是 Session-only，每次新开 CodeBuddy 会话后需重新注册
- Step 2 依赖 Step 1 先完成（需要商品目录存在）
- Step 2 前需确认 fetch_product_imgs.py 的 NAME_TO_EN 字典已包含当日所有商品关键词
- Step 3 依赖 Step 1 的 01_全链路分析.md 和 03_价格单.md 格式正确
- Step 4 国内/国外两条命令并发执行
- Step 4 文案来源：国内平台取 05_发布文案.md 中文版，国外平台取英文版，不混用
