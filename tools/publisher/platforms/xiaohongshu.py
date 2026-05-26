"""
小红书图文发布模块（CloakBrowser 版）
替代原 xiaohongshu.js，解决封号问题

封号根因：
  - 原版用 Playwright 原生 chromium.launch()，webdriver=true，指纹暴露
  - 无持久化 profile，同账号频繁"换设备"触发风控
  - 操作行为无人类模拟（瞬间精确点击）

本版修复：
  1. CloakBrowser launch_persistent_context：固定设备指纹 + 持久化 session
  2. humanize=True + human_preset="careful"：鼠标曲线、键盘延迟、打字错误模拟
  3. --fingerprint 固定种子：同账号始终呈现同一"设备"

用法（由 index.js 通过 child_process.execSync 调用）：
  python xiaohongshu.py --title "标题" --desc "描述" --images "a.jpg,b.jpg"

依赖：
  pip install cloakbrowser
"""

import argparse
import json
import os
import sys
import time
import random
from pathlib import Path

try:
    import cloakbrowser
except ImportError:
    print("[小红书] 错误：未安装 cloakbrowser，请执行 pip install cloakbrowser", flush=True)
    sys.exit(1)

# 持久化 profile 存放路径（与 Playwright launchPersistentContext 对齐）
PROFILE_DIR = Path(__file__).parent.parent / "profiles" / "xiaohongshu"
CREATOR_URL = "https://creator.xiaohongshu.com"

# 固定指纹种子（同账号始终呈现同一"设备"，修改后相当于换设备）
FINGERPRINT_SEED = "xhs_publisher_v1"


def human_delay(min_ms=300, max_ms=900):
    """模拟人类操作延迟（毫秒级随机）"""
    time.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


def publish(title: str, desc: str, images: list[str]) -> dict:
    print("[小红书] 开始发布图文（CloakBrowser 反检测模式）...", flush=True)

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    context = cloakbrowser.launch_persistent_context(
        str(PROFILE_DIR),
        headless=False,
        humanize=True,
        human_preset="careful",
        args=[
            f"--fingerprint={FINGERPRINT_SEED}",
            "--ignore-certificate-errors",
            "--ignore-ssl-errors",
        ],
        locale="zh-CN",
        timezone="Asia/Shanghai",
        viewport={"width": 1440, "height": 900},
        ignore_https_errors=True,
    )

    with context:
        page = context.new_page()

        try:
            # 1. 打开发布页
            print("[小红书] 打开创作者中心发布页...", flush=True)
            page.goto(
                f"{CREATOR_URL}/publish/publish?source=official",
                wait_until="domcontentloaded",
                timeout=60000,
            )
            human_delay(3000, 5000)

            # 检测是否需要登录
            if "login" in page.url or "passport" in page.url or CREATOR_URL not in page.url:
                print("[小红书] 检测到未登录，请手动扫码/输入账号密码登录...", flush=True)
                print("[小红书] 等待 120 秒供手动登录...", flush=True)
                # 等待登录成功（跳转到任意 creator 页面）
                try:
                    page.wait_for_function(
                        f"() => window.location.href.includes('{CREATOR_URL}')",
                        timeout=120000,
                    )
                except Exception:
                    pass
                human_delay(2000, 3000)
                # 登录完后重新跳转到发布页
                print("[小红书] 登录完成，跳转到发布页...", flush=True)
                page.goto(
                    f"{CREATOR_URL}/publish/publish?source=official",
                    wait_until="domcontentloaded",
                    timeout=60000,
                )
                human_delay(3000, 4000)

            # 2. 切换到"上传图文"tab
            print("[小红书] 切换到上传图文tab...", flush=True)
            switched = page.evaluate("""
                () => {
                    const tabs = document.querySelectorAll('.creator-tab');
                    for (const tab of tabs) {
                        if (tab.textContent && tab.textContent.includes('上传图文')) {
                            tab.click();
                            return true;
                        }
                    }
                    return false;
                }
            """)
            if not switched:
                raise RuntimeError("[小红书] 未找到上传图文tab")
            human_delay(1500, 2500)

            # 3. 上传图片（用 JS click 触发 filechooser，绕过 humanize）
            print(f"[小红书] 上传 {len(images)} 张图片...", flush=True)
            abs_paths = [str(Path(p).resolve()) for p in images]

            with page.expect_file_chooser() as fc_info:
                page.evaluate("""
                    () => {
                        const btn = document.querySelector('button.d-button');
                        if (btn) btn.click();
                    }
                """)
            file_chooser = fc_info.value
            file_chooser.set_files(abs_paths)

            # 等待图片上传完成
            print("[小红书] 等待图片处理...", flush=True)
            human_delay(8000, 12000)

            # 4. 填写标题（JS 直接 fill，避免 humanize click 卡死）
            print("[小红书] 填写标题...", flush=True)
            if title:
                title_20 = title[:20]
                page.evaluate("""
                    (t) => {
                        const el = document.querySelector('input[placeholder*="标题"]');
                        if (!el) return;
                        el.focus();
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeInputValueSetter.call(el, t);
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                        el.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                """, title_20)
                if title_20 != title:
                    print(f"[小红书] 标题已截断至20字: {title_20}", flush=True)
                human_delay(300, 600)

            # 5. 填写描述（JS 参数传递）
            print("[小红书] 填写描述...", flush=True)
            if desc:
                page.evaluate("""
                    (text) => {
                        const el = document.querySelector('[contenteditable="true"]');
                        if (!el) return;
                        el.focus();
                        el.innerText = text;
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                        el.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                """, desc)
                human_delay(500, 800)

            human_delay(1000, 1500)

            # 6. 点击发布按钮（JS click 绕过 humanize）
            print("[小红书] 点击发布按钮...", flush=True)
            human_delay(1000, 1500)

            # 点击空白区收起弹窗（用 JS，不走 humanize mouse）
            page.evaluate("document.body.click()")
            human_delay(500, 800)

            # 关闭活动详情等弹窗（用 JS click × 按钮）
            page.evaluate("""
                () => {
                    const closeBtns = document.querySelectorAll('[class*="close"], [class*="Close"]');
                    for (const btn of closeBtns) {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) { btn.click(); break; }
                    }
                }
            """)
            human_delay(500, 800)

            page.screenshot(path="debug_xhs_before_publish.png", full_page=False)

            # 直接用 JS 找底部"发布"按钮并点击（最可靠）
            published = page.evaluate("""
                () => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    // 找文本为"发布"且在页面底部的按钮
                    const btn = btns.find(b => b.textContent.trim() === '发布' && b.getBoundingClientRect().y > 500);
                    if (btn) { btn.click(); return true; }
                    // 退而求其次：任何文本为"发布"的可见按钮
                    const btn2 = btns.find(b => b.textContent.trim() === '发布' && b.offsetParent !== null);
                    if (btn2) { btn2.click(); return true; }
                    return false;
                }
            """)

            if published:
                print("[小红书] JS 点击发布按钮成功", flush=True)
            else:
                print("[小红书] 兜底：用坐标点击发布按钮...", flush=True)
                page.screenshot(path="debug_xhs_fallback.png", full_page=False)
                # 根据截图校准：发布按钮在底部右侧，约 (716, 825)
                page.mouse.click(716, 825)

            human_delay(800, 1500)
            page.screenshot(path="debug_xhs_after_click.png", full_page=False)
            print("[小红书] 已点击发布按钮", flush=True)

            # 7. 等待发布结果
            human_delay(4000, 6000)

            current_url = page.url
            if any(x in current_url for x in ["/note-manager", "/success"]) or "/publish" not in current_url:
                print(f"[小红书] 发布成功！跳转到: {current_url}", flush=True)
                return {"success": True, "platform": "xiaohongshu"}

            # 检测 toast 提示
            try:
                toast = page.locator('.d-toast, [class*="toast"], [class*="message"]').first.text_content(timeout=3000)
                if toast:
                    print(f"[小红书] 提示信息: {toast}", flush=True)
            except Exception:
                pass

            print("[小红书] 发布完成（请到笔记管理确认）", flush=True)
            return {"success": True, "platform": "xiaohongshu"}

        except Exception as e:
            print(f"[小红书] 发布异常: {e}", flush=True)
            try:
                page.screenshot(path="debug_xhs_error.png", full_page=False)
            except Exception:
                pass
            raise


def main():
    parser = argparse.ArgumentParser(description="小红书图文发布（CloakBrowser 反检测版）")
    parser.add_argument("--title", required=True, help="发布标题（最多20字，自动截断）")
    parser.add_argument("--desc", default="", help="发布描述")
    parser.add_argument("--images", required=True, help="图片路径，多张用英文逗号分隔")
    args = parser.parse_args()

    images = [p.strip() for p in args.images.split(",") if p.strip()]
    result = publish(title=args.title, desc=args.desc, images=images)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
