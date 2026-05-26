"""
YouTube 社区帖子图文发布模块（CloakBrowser 反检测版）

说明：
  YouTube 支持「社区帖子」（Community Post），可发布图片+文字，
  类似微博/Twitter，适合跨境电商种草内容推广。
  需要 YouTube Studio 账号（频道需有社区功能，一般需要 500+ 订阅者）。

反检测：
  Google 对自动化浏览器检测极为严格，必须用 CloakBrowser 绕过。

用法（由 youtube.js 通过 child_process 调用）：
  python youtube.py --title "标题" --desc "描述" --images "a.jpg,b.jpg"

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
    print("[YouTube] 错误：未安装 cloakbrowser，请执行 pip install cloakbrowser", flush=True)
    sys.exit(1)

PROFILE_DIR = Path(__file__).parent.parent / "profiles" / "youtube"
STUDIO_URL = "https://studio.youtube.com"
# 直接跳转到社区发帖编辑器（带 show_create_dialog=1 参数会自动弹出编辑框）
POST_DIALOG_URL = "https://www.youtube.com/channel/UCTpDg3F-Ts28Gn95SePqj0w/posts?show_create_dialog=1"
FINGERPRINT_SEED = "yt_publisher_v1"


def human_delay(min_ms=300, max_ms=900):
    time.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


def publish(title: str, desc: str, images: list) -> dict:
    print("[YouTube] 开始发布社区帖子（CloakBrowser 反检测模式）...", flush=True)

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    context = cloakbrowser.launch_persistent_context(
        str(PROFILE_DIR),
        headless=False,
        humanize=True,
        human_preset="careful",
        args=[
            f"--fingerprint={FINGERPRINT_SEED}",
            "--ignore-certificate-errors",
        ],
        locale="en-US",
        timezone="America/New_York",
        viewport={"width": 1440, "height": 900},
        ignore_https_errors=True,
    )

    with context:
        page = context.new_page()

        try:
            # 1. 先打开 Studio 确认登录状态
            print("[YouTube] 打开 YouTube Studio 验证登录...", flush=True)
            page.goto(STUDIO_URL, wait_until="domcontentloaded", timeout=60000)
            human_delay(3000, 5000)

            # 检测是否需要登录
            current_url = page.url
            if "accounts.google.com" in current_url or "signin" in current_url:
                print("[YouTube] 检测到未登录，请手动完成 Google 账号登录...", flush=True)
                print("[YouTube] 等待 120 秒供手动登录...", flush=True)
                try:
                    page.wait_for_function(
                        f"() => window.location.href.includes('{STUDIO_URL}')",
                        timeout=120000,
                    )
                except Exception:
                    pass
                human_delay(3000, 4000)

            # 2. 直接导航到社区发帖编辑器 URL（携带 show_create_dialog=1 参数自动弹出编辑框）
            print(f"[YouTube] 直接打开发帖编辑器...", flush=True)
            page.goto(POST_DIALOG_URL, wait_until="domcontentloaded", timeout=60000)
            human_delay(4000, 6000)
            page.screenshot(path="debug_yt_community.png", full_page=False)
            print(f"[YouTube] 发帖编辑器 URL: {page.url}", flush=True)

            # 3. 点击文字输入框激活编辑器（占位符「和粉丝分享最新动态」区域）
            print("[YouTube] 激活文字输入框...", flush=True)
            page.evaluate("""
                () => {
                    // 先点击编辑区域激活（占位符容器）
                    const placeholder = document.querySelector('#placeholder-area, #placeholder');
                    if (placeholder && placeholder.offsetParent !== null) {
                        placeholder.click();
                        return;
                    }
                    // 兜底：点 contenteditable 元素
                    const editor = document.querySelector('#contenteditable-root');
                    if (editor) { editor.click(); }
                }
            """)
            human_delay(1000, 1500)

            # 4. 填写文字内容
            content = f"{title}\n\n{desc}" if title else desc
            if content:
                print("[YouTube] 填写帖子文字...", flush=True)
                text_filled = page.evaluate("""
                    (text) => {
                        const editor = document.querySelector('#contenteditable-root');
                        if (editor) {
                            editor.focus();
                            // 使用 execCommand 模拟真实输入（保留 YouTube 的响应事件）
                            document.execCommand('selectAll', false, null);
                            document.execCommand('insertText', false, text);
                            return true;
                        }
                        return false;
                    }
                """, content)

                if not text_filled:
                    print("[YouTube] 未找到文字输入框，截图查看...", flush=True)
                    page.screenshot(path="debug_yt_no_textbox.png", full_page=False)
                else:
                    human_delay(800, 1200)

            # 5. 上传图片：点「图片」按钮 → setInputFiles
            if images:
                print(f"[YouTube] 上传 {len(images)} 张图片...", flush=True)
                abs_paths = [str(Path(p).resolve()) for p in images]
                # YouTube 社区帖子最多10张图片，我们统一限制9张
                if len(abs_paths) > 9:
                    print(f"[YouTube] 图片超过9张（{len(abs_paths)}张），自动截取前9张", flush=True)
                    abs_paths = abs_paths[:9]

                # 先关闭可能出现的满意度调查等弹窗
                page.evaluate("""
                    () => {
                        // 关闭右下角满意度弹窗（点 × 关闭按钮）
                        const closeBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
                        for (const btn of closeBtns) {
                            const label = btn.getAttribute('aria-label') || '';
                            if (label === '关闭' || label === 'Close' || label === 'Dismiss') {
                                if (btn.offsetParent !== null) { btn.click(); return; }
                            }
                        }
                        // 兜底：找带 × 文本的关闭按钮
                        const svgs = document.querySelectorAll('yt-icon-button, button');
                        for (const btn of svgs) {
                            if (btn.className && btn.className.includes('close') && btn.offsetParent !== null) {
                                btn.click(); return;
                            }
                        }
                    }
                """)
                human_delay(500, 800)

                # 点「图片」按钮（aria-label="添加图片" 或文本「图片」）
                img_btn_clicked = page.evaluate("""
                    () => {
                        // 优先 aria-label 精准匹配
                        const byLabel = document.querySelector('button[aria-label="添加图片"], button[aria-label="Add image"]');
                        if (byLabel) { byLabel.click(); return true; }
                        // 兜底：找文本为「图片」的按钮
                        const btns = Array.from(document.querySelectorAll('button'));
                        for (const btn of btns) {
                            const txt = (btn.textContent || '').trim();
                            if (txt === '图片' || txt === 'Photo' || txt === 'Image') {
                                btn.click(); return true;
                            }
                        }
                        return false;
                    }
                """)

                if img_btn_clicked:
                    human_delay(1000, 1500)
                    # 强制显示 input[type=file] 并直接 setFiles
                    page.evaluate("""
                        () => {
                            document.querySelectorAll('input[type="file"]').forEach(inp => {
                                inp.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;width:1px;height:1px;position:fixed;top:0;left:0;';
                            });
                        }
                    """)
                    human_delay(300, 500)

                    inputs = page.query_selector_all('input[type="file"]')
                    if inputs:
                        inputs[0].set_input_files(abs_paths)
                        print(f"[YouTube] 已设置 {len(abs_paths)} 张图片，等待上传...", flush=True)
                        human_delay(8000, 12000)
                    else:
                        print("[YouTube] 未找到 file input，截图查看...", flush=True)
                        page.screenshot(path="debug_yt_no_file_input.png", full_page=False)
                else:
                    print("[YouTube] 未找到「添加图片」按钮，截图查看...", flush=True)
                    page.screenshot(path="debug_yt_no_img_btn.png", full_page=False)

            page.screenshot(path="debug_yt_before_post.png", full_page=False)

            # 6. 点击「发布」按钮
            print("[YouTube] 点击「发布」按钮...", flush=True)
            human_delay(1000, 1500)

            posted = page.evaluate("""
                () => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    for (const btn of btns) {
                        const txt = btn.textContent?.trim();
                        const label = btn.getAttribute('aria-label') || '';
                        if ((txt === '发布' || txt === 'Post' || label === '发布' || label === 'Post')
                            && btn.offsetParent !== null
                            && !btn.disabled) {
                            btn.click();
                            return 'text:' + txt;
                        }
                    }
                    return null;
                }
            """)

            if posted:
                print(f"[YouTube] 已点击发布按钮: {posted}", flush=True)
            else:
                print("[YouTube] 未找到发布按钮，截图查看...", flush=True)
                page.screenshot(path="debug_yt_no_post_btn.png", full_page=False)
                raise RuntimeError("[YouTube] 找不到「发布」按钮")

            # 8. 等待发布完成
            human_delay(5000, 8000)
            page.screenshot(path="debug_yt_after_post.png", full_page=False)
            print(f"[YouTube] 发布完成，当前页面: {page.url}", flush=True)

            return {"success": True, "platform": "youtube"}

        except Exception as e:
            print(f"[YouTube] 发布异常: {e}", flush=True)
            try:
                page.screenshot(path="debug_yt_error.png", full_page=False)
            except Exception:
                pass
            raise


def main():
    parser = argparse.ArgumentParser(description="YouTube 社区帖子发布（CloakBrowser 反检测版）")
    parser.add_argument("--title", default="", help="帖子标题")
    parser.add_argument("--desc", default="", help="帖子内容")
    parser.add_argument("--images", default="", help="图片路径，多张用英文逗号分隔")
    args = parser.parse_args()

    images = [p.strip() for p in args.images.split(",") if p.strip()] if args.images else []
    result = publish(title=args.title, desc=args.desc, images=images)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
