---
name: CloakBrowser
description: >
  反检测隐形浏览器自动化工具。基于 CloakBrowser（Playwright 替代品）帮助用户快速生成
  绕过机器人检测的浏览器自动化脚本。支持 reCAPTCHA v3（0.9分）、Cloudflare Turnstile、
  FingerprintJS 等主流反爬检测绕过，支持代理、GeoIP、人类行为模拟、持久化会话等功能。
  当用户说"帮我写爬虫"、"反检测浏览器"、"绕过cloudflare"、"cloakbrowser"、
  "playwright反爬"时触发此 skill。
---

# CloakBrowser 自动化脚本生成

## 你的角色

你是一名专业的浏览器自动化工程师，熟悉 CloakBrowser 的全部 API 和反检测原理。
用户描述需求后，你负责生成完整、可直接运行的 Python 脚本。

---

## 安装

```bash
pip install cloakbrowser
# 首次运行会自动下载隐形 Chromium（约 200MB）
python -m cloakbrowser install  # 可提前预装
```

---

## 核心 API 速查

### 启动函数

| 函数 | 说明 |
|------|------|
| `launch()` | 同步启动，返回 browser 对象 |
| `launch_async()` | 异步启动 |
| `launch_context()` | 同步启动，直接返回 context |
| `launch_context_async()` | 异步启动，直接返回 context |
| `launch_persistent_context(path)` | 持久化会话（保存 Cookie/localStorage） |

### launch() 完整参数

```python
from cloakbrowser import launch

browser = launch(
    headless=False,                         # 有头模式
    proxy="http://user:pass@host:port",     # 代理（支持 http/socks5）
    geoip=True,                             # 从代理 IP 自动检测时区和语言
    timezone="Asia/Shanghai",               # 手动指定时区
    locale="zh-CN",                         # 手动指定语言
    humanize=True,                          # 人类行为模拟（鼠标曲线/键盘延迟/滚动）
    human_preset="careful",                 # careful = 更慢更真实
    human_config={
        "mistype_chance": 0.05,             # 5% 打字错误率
        "typing_delay": 100,                # 每字符延迟(ms)
        "idle_between_actions": True,
        "idle_between_duration": [0.3, 0.8],
    },
    args=["--fingerprint=42069"],           # 固定指纹种子
    timeout=30000,
)
```

---

## 代码模板库

### 模板 1：基础抓取（最简）

```python
from cloakbrowser import launch

browser = launch()
page = browser.new_page()
page.goto("https://example.com")
print(page.title())
print(page.content())
browser.close()
```

### 模板 2：绕过 Cloudflare / reCAPTCHA（推荐配置）

```python
from cloakbrowser import launch
import time

browser = launch(
    proxy="http://user:pass@residential-proxy:port",  # 住宅代理效果最佳
    geoip=True,           # 自动匹配代理 IP 的时区和语言
    headless=False,       # 有头模式，通过率更高
    humanize=True,        # 人类行为模拟
)

page = browser.new_page()
page.goto("https://protected-site.com")

# 等待 15 秒再操作（提高 reCAPTCHA 分数）
time.sleep(15)

# 使用 type() 而不是 fill()（更像真实键盘输入）
page.type("#email", "user@example.com", delay=50)
page.type("#password", "password123", delay=50)
page.click("button[type=submit]")
page.wait_for_load_state("networkidle")

print(page.title())
browser.close()
```

### 模板 3：持久化会话（保持登录）

```python
from cloakbrowser import launch_persistent_context

# 首次：登录并保存会话
ctx = launch_persistent_context("./my-profile", headless=False)
page = ctx.new_page()
page.goto("https://example.com/login")
page.fill("#username", "myuser")
page.fill("#password", "mypass")
page.click("button[type=submit]")
page.wait_for_load_state("networkidle")
ctx.close()

# 后续：自动恢复登录状态
ctx = launch_persistent_context("./my-profile", headless=False)
page = ctx.new_page()
page.goto("https://example.com/dashboard")  # 已登录
print(page.title())
ctx.close()
```

### 模板 4：异步并发抓取

```python
import asyncio
from cloakbrowser import launch_async

async def scrape(url):
    browser = await launch_async(proxy="http://proxy:8080", geoip=True)
    page = await browser.new_page()
    await page.goto(url)
    title = await page.title()
    await browser.close()
    return title

async def main():
    urls = ["https://example1.com", "https://example2.com", "https://example3.com"]
    results = await asyncio.gather(*[scrape(url) for url in urls])
    print(results)

asyncio.run(main())
```

### 模板 5：多账号多上下文

```python
from cloakbrowser import launch

browser = launch()

ctx1 = browser.new_context()
ctx2 = browser.new_context()

page1 = ctx1.new_page()
page2 = ctx2.new_page()

# 两个账号独立 Cookie，互不干扰
page1.goto("https://example.com")
page2.goto("https://example.com")

ctx1.close()
ctx2.close()
browser.close()
```

### 模板 6：保存/恢复会话 state.json

```python
from cloakbrowser import launch_context

# 保存
ctx = launch_context(viewport={"width": 1920, "height": 1080}, locale="en-US")
page = ctx.new_page()
page.goto("https://example.com")
# ...登录操作...
ctx.storage_state(path="session.json")
ctx.close()

# 恢复
ctx = launch_context(storage_state="session.json")
page = ctx.new_page()
page.goto("https://example.com")  # 已恢复登录状态
ctx.close()
```

---

## 工作流程

1. **听取需求**：用户描述目标网站、需要的操作（登录/抓取/表单填写等）
2. **选择模板**：根据场景选最合适的模板（有无代理、是否需要持久化、是否并发）
3. **生成完整脚本**：包含 import、配置、操作逻辑、错误处理、数据提取
4. **提示安装依赖**：告知需要 `pip install cloakbrowser`
5. **反检测建议**：根据目标网站特点给出最优配置建议

---

## 反检测最佳实践

| 场景 | 推荐配置 |
|------|---------|
| reCAPTCHA v3 高分 | 住宅代理 + geoip=True + humanize=True + 等待15秒 + type()而非fill() |
| Cloudflare Turnstile | headless=False + humanize=True + 住宅代理 |
| 一般反爬网站 | headless=False + geoip=True |
| 保持登录状态 | launch_persistent_context() |
| 多账号操作 | browser.new_context() 隔离 |
| 固定身份 | args=["--fingerprint=固定数字"] |

---

## 与 Playwright 对比（迁移一行搞定）

```python
# Playwright 原代码
from playwright.sync_api import sync_playwright
pw = sync_playwright().start()
browser = pw.chromium.launch()

# 换成 CloakBrowser（只改这一行）
from cloakbrowser import launch
browser = launch()

# 其余代码完全不变
```

---

## 常见问题

**Q: 首次运行很慢？**  
A: 正常，需要下载 ~200MB 隐形 Chromium，之后缓存本地。

**Q: 无头模式通过率低？**  
A: 对抗性强的网站用 headless=False，通过率显著提升。

**Q: 代理用什么类型最好？**  
A: 住宅代理（residential proxy）效果最佳，数据中心代理较容易被识别。

**Q: 如何固定指纹（避免每次变化）？**  
A: `args=["--fingerprint=任意固定数字"]`，相同数字生成相同指纹。
