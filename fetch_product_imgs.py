"""
用 CloakBrowser 从 Google Images 搜索抓取产品主图
- 从 Google 图片搜索的 script 块里提取原图直链
- 动态读取当天 output/{date}/ 下的所有商品目录
- 每款下载 2 张产品图，保存为 产品_01.jpg / 产品_02.jpg
- 已有 >= 2 张产品图则跳过
- 支持命令行传入日期参数，默认当天
"""
import os, re, sys, time, urllib.request
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
BASE = rf"D:\Product\output\{date_str}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}

# 中文商品名 → Google 图片搜索词
NAME_TO_EN = {
    "LED灯带":         "LED strip lights RGB remote control product",
    "灯带":            "LED strip lights RGB product",
    "蓝牙音箱":        "portable bluetooth speaker product",
    "音箱":            "portable bluetooth speaker product",
    "冷敷冰敷眼罩":    "cooling gel eye mask cold compress product",
    "眼罩":            "cooling gel eye mask product",
    "宠物硅胶梳毛刷":  "silicone pet grooming brush deshedding product",
    "梳毛刷":          "pet grooming brush product",
    "硅胶保鲜袋":      "silicone reusable food storage bags set product",
    "保鲜袋":          "reusable silicone food bags product",
    "硅胶折叠水杯":    "collapsible silicone water bottle foldable product",
    "折叠水杯":        "foldable collapsible water bottle product",
    "磁吸车载手机支架": "magnetic car phone mount holder product",
    "车载手机支架":    "car phone holder magnetic mount product",
    "美妆收纳旋转架":  "rotating makeup organizer cosmetic storage product",
    "旋转架":          "rotating makeup organizer product",
    "运动束口双肩包":  "drawstring backpack gym sports bag product",
    "束口包":          "drawstring bag sports product",
    "颈挂手持风扇":    "wearable neck fan portable bladeless product",
    "颈挂风扇":        "neck fan portable wearable product",
    "风扇":            "portable wearable neck fan product",
    # 2026-05-20 新增
    "便携式电动打蛋器": "portable mini electric whisk handheld egg beater USB product",
    "打蛋器":          "mini electric whisk egg beater product",
    "厚底增高休闲老爹鞋": "chunky platform dad sneakers EVA sole women product",
    "老爹鞋":          "chunky dad sneakers platform shoes product",
    "复古帆布托特包":   "vintage canvas tote bag heavyweight women product",
    "托特包":          "canvas tote bag vintage women product",
    "多功能磁吸手机支架": "magnetic phone stand 360 rotation desktop car mount product",
    "手机支架":        "magnetic phone holder stand product",
    "多功能腰包胸包":   "multi-pocket crossbody waist bag fanny pack product",
    "腰包":            "waist bag fanny pack crossbody product",
    "宽松休闲oversize卫衣": "oversized hoodie heavyweight cotton streetwear product",
    "oversize卫衣":    "oversized hoodie sweatshirt product",
    "卫衣":            "oversized hoodie sweatshirt product",
    "折叠硅胶厨房漏斗套装": "collapsible silicone kitchen funnel set food grade product",
    "漏斗":            "foldable silicone funnel kitchen set product",
    "显瘦抽绳束腰连衣裙": "drawstring waist dress slimming summer women product",
    "束腰连衣裙":      "drawstring waist midi dress women product",
    "硅胶冰棒模具套装": "silicone popsicle mold set DIY ice cream maker product",
    "冰棒模具":        "popsicle mold silicone DIY ice lolly product",
    "轻量透气网面运动鞋": "lightweight mesh running shoes breathable athletic product",
    "网面运动鞋":      "mesh sneakers breathable running shoes product",
    # 2026-05-21 新增
    "硅胶折叠收纳碗":  "silicone foldable collapsible bowl camping outdoor product",
    "折叠收纳碗":      "collapsible silicone bowl foldable camping product",
    "迷你手持风扇":    "mini handheld portable fan USB rechargeable product",
    "手持风扇":        "handheld mini fan portable rechargeable product",
    "多功能开罐器":    "multi-function can opener stainless steel ergonomic product",
    "开罐器":          "can opener multi-function kitchen tool product",
    "磁吸无线充电支架": "magnetic wireless charging stand MagSafe iPhone product",
    "无线充电支架":    "wireless charger stand magnetic phone holder product",
    "Y2K辣妹短外套":   "Y2K cropped jacket women retro streetwear product",
    "辣妹短外套":      "cropped jacket Y2K fashion women product",
    "男士冰丝速干运动裤": "men ice silk quick dry athletic pants gym sports product",
    "冰丝速干运动裤":  "quick dry athletic pants men ice silk product",
    "女士厚底老爹鞋":  "women chunky platform dad sneakers thick sole product",
    "厚底老爹鞋":      "platform dad shoes women chunky sneakers product",
    "男士轻便透气跑鞋": "men lightweight breathable mesh running shoes product",
    "透气跑鞋":        "men lightweight running shoes breathable mesh product",
    "编织草编托特包":  "woven straw tote bag summer beach women product",
    "草编托特包":      "straw woven tote bag beach summer product",
    "Y2K蝴蝶结发夹套装": "Y2K butterfly hair clips set colorful pearl product",
    "蝴蝶结发夹套装":  "butterfly hair clips set Y2K accessories product",
    # 2026-05-22 新增
    "便携式榨汁搅拌杯": "portable blender bottle USB rechargeable smoothie fruit product",
    "榨汁搅拌杯":      "portable mini blender smoothie bottle USB product",
    "电动自动搅拌杯":  "self stirring mug electric auto stir coffee magnetic product",
    "自动搅拌杯":      "electric self stirring cup auto mix coffee product",
    "多功能蔬菜切碎器": "vegetable chopper multi-function food slicer dicer product",
    "蔬菜切碎器":      "vegetable chopper slicer dicer kitchen gadget product",
    "硅胶折叠马桶刷":  "silicone toilet brush foldable holder bathroom cleaning product",
    "折叠马桶刷":      "foldable silicone toilet brush holder set product",
    "法式碎花衬衫连衣裙": "french floral shirt dress women summer boho product",
    "碎花衬衫连衣裙":  "floral print shirt dress women summer product",
    "男士休闲工装短裤": "men cargo shorts multi pocket casual summer streetwear product",
    "工装短裤":        "cargo shorts men multi pocket casual product",
    "儿童防晒冰袖套装": "kids UV cooling arm sleeves children sun protection ice silk product",
    "防晒冰袖":        "children UV arm sleeves sun protection cooling product",
    "女士厚底凉鞋":    "women platform sandals thick sole buckle summer product",
    "厚底凉鞋":        "platform sandals women chunky sole summer product",
    "男士轻量徒步登山鞋": "men lightweight hiking shoes waterproof trail outdoor product",
    "徒步登山鞋":      "men hiking trail shoes lightweight waterproof product",
    "竹编草帽沙滩帽":  "bamboo straw hat women wide brim beach summer product",
    "草帽沙滩帽":      "straw beach hat women wide brim summer product",
    "珍珠链条腰包":    "pearl chain belt bag crossbody waist pack women product",
    "链条腰包":        "pearl chain crossbody bag women belt pack product",
    # 2026-05-23 新增
    "多功能厨房定时器": "magnetic kitchen timer loud alarm large display product",
    "厨房定时器":      "kitchen timer magnetic countdown loud alarm product",
    "硅胶折叠水瓶":    "silicone collapsible water bottle foldable leakproof product",
    "折叠水瓶":        "foldable silicone water bottle collapsible product",
    "自粘挂钩承重无痕钉": "self adhesive hook heavy duty wall no drill damage-free product",
    "无痕钉":          "adhesive wall hook no drill damage-free product",
    "迷你随身口袋充电宝": "mini pocket power bank ultra thin portable charger USB-C product",
    "口袋充电宝":      "pocket power bank mini portable charger product",
    "女士扎染渐变运动套装": "tie dye gradient women workout set leggings sports bra product",
    "扎染运动套装":    "tie dye women yoga set sports outfit product",
    "男士复古水洗牛仔夹克": "men vintage washed denim jacket retro streetwear product",
    "水洗牛仔夹克":    "men washed denim jacket vintage retro product",
    "儿童卡通拼色连帽冲锋衣": "kids cartoon colorblock windbreaker jacket hooded children product",
    "儿童冲锋衣":      "kids windbreaker jacket colorblock hooded product",
    "女士编织镂空平底穆勒鞋": "women woven cut-out flat mule shoes summer boho product",
    "穆勒鞋":          "woven flat mule shoes women summer product",
    "男士透气网面运动跑鞋": "men breathable mesh running shoes lightweight athletic product",
    "网面跑鞋":        "men mesh running shoes breathable lightweight product",
    "帆布大容量托特包": "canvas large tote bag shoulder bag women daily commuter product",
    "大容量托特包":    "canvas tote bag large capacity women product",
    "彩色串珠发箍":    "colorful beaded headband women hair accessory boho product",
    "串珠发箍":        "beaded headband colorful women hair accessory product",
    # 2026-05-24 新增
    "多功能剥玉米神器": "corn stripper peeler kitchen gadget multi-function product",
    "剥玉米神器":      "corn stripper cob peeler kitchen tool product",
    "硅胶密封夹保鲜夹套装": "silicone bag clip sealing clips food storage set product",
    "保鲜夹套装":      "food sealing clips bag clips kitchen set product",
    "车载手机无线充电支架": "wireless car charger phone mount holder dashboard product",
    "无线充电支架":    "wireless charging car mount phone holder product",
    "迷你折叠剪刀随身工具": "mini folding scissors portable travel keychain tool product",
    "折叠剪刀":        "folding scissors mini portable travel product",
    "女士蝴蝶结吊带露背连衣裙": "women butterfly bow spaghetti strap backless dress summer product",
    "露背连衣裙":      "backless bow strap dress women summer product",
    "男士冰丝薄款防晒外套": "men ice silk thin UV protection sun jacket lightweight product",
    "防晒外套":        "men lightweight sun protection jacket ice silk product",
    "儿童恐龙印花宽松短袖T恤": "kids dinosaur print loose short sleeve t-shirt children product",
    "恐龙印花T恤":     "dinosaur print kids tshirt children casual product",
    "女士蕾丝蝴蝶结芭蕾平底鞋": "women lace bow ballet flat shoes ballerina product",
    "芭蕾平底鞋":      "ballet flats lace bow women flat shoes product",
    "男士复古帆布硫化鞋": "men retro canvas vulcanized sneakers vintage low top product",
    "帆布硫化鞋":      "canvas vulcanized shoes men retro sneakers product",
    "透明PVC果冻单肩包": "transparent PVC jelly bag clear shoulder bag women product",
    "PVC果冻包":       "clear PVC transparent bag women jelly shoulder product",
    "编织渔夫帽遮阳帽": "woven bucket hat sun hat women summer outdoor product",
    "渔夫帽":          "woven bucket hat women summer sun protection product",
    # 2026-05-25 新增
    "电动磨脚去死皮神器": "electric callus remover rechargeable foot file pedicure product",
    "磨脚神器":          "electric callus remover foot file pedicure product",
    "硅胶折叠厨房置物架": "silicone foldable dish drying rack kitchen organizer product",
    "折叠置物架":         "foldable silicone kitchen rack organizer product",
    "多功能调料瓶套装":   "spice jar set condiment bottles kitchen organizer labels product",
    "调料瓶套装":         "spice bottle set kitchen seasoning jars product",
    "磁吸手机壳支架二合一": "magsafe phone case with kickstand magnetic iPhone product",
    "手机壳支架":          "phone case with stand kickstand magnetic product",
    "女士抹胸荷叶边连衣裙": "women ruffle tube top dress chiffon summer sundress product",
    "荷叶边连衣裙":         "ruffle strapless dress women summer chiffon product",
    "男士冰感速干运动短裤": "men ice silk quick dry athletic shorts summer sports product",
    "速干运动短裤":         "men quick dry sports shorts athletic product",
    "儿童撞色拼接防晒连体泳衣": "kids UPF50 long sleeve one piece swimsuit colorblock children product",
    "防晒连体泳衣":             "kids long sleeve rash guard swimsuit UPF50 product",
    "女士厚底松糕凉鞋": "women platform sandals chunky heel ankle strap summer product",
    "松糕凉鞋":         "women platform sandals chunky thick sole summer product",
    "男士休闲一脚蹬帆布鞋": "men slip on canvas loafers casual shoes lightweight product",
    "一脚蹬帆布鞋":          "men slip on canvas shoes casual loafer product",
    "草编度假手提包": "straw beach tote bag woven handbag summer vacation product",
    "草编手提包":     "woven straw tote bag beach summer product",
    "叠戴多层金属项链套装": "layered necklace set multi strand gold chain women jewelry product",
    "多层项链套装":          "layered necklaces set gold chain women jewelry product",
    # 2026-05-26 新增
    "硅胶折叠水瓶":          "collapsible silicone water bottle foldable leakproof gym product",
    "多功能厨房削皮器套装":  "vegetable peeler set stainless steel 3 piece kitchen product",
    "削皮器套装":            "peeler set stainless steel vegetable kitchen product",
    "磁吸LED阅读灯":         "magnetic LED book reading light clip USB rechargeable product",
    "阅读灯":                "book light LED clip reading lamp product",
    "桌面迷你加湿器":        "mini desktop humidifier RGB night light USB ultrasonic product",
    "迷你加湿器":            "mini humidifier USB desktop RGB led product",
    "Y2K辣妹短款牛仔夹克":  "Y2K cropped denim jacket women vintage streetwear product",
    "短款牛仔夹克":          "cropped denim jacket women Y2K fashion product",
    "男士速干运动短裤":      "men quick dry athletic shorts multi pocket gym product",
    "速干运动短裤":          "men quick dry sports shorts athletic gym product",
    "女士厚底老爹鞋":        "women chunky platform dad sneakers thick sole white product",
    "男士复古帆布鞋":        "men classic low top canvas sneakers vintage retro product",
    "复古帆布鞋":            "men canvas low top sneakers classic product",
    "迷你腋下包":            "mini underarm bag crocodile pattern PU leather women product",
    "腋下包":                "mini underarm bag croc texture women handbag product",
    "Y2K蝴蝶结发夹套装":    "Y2K bow hair clips set claw clips women hair accessory product",
    "蝴蝶结发夹套装":        "bow hair clips set Y2K accessories product",
}

# 优先保留的高质量产品图 CDN
GOOD_CDN = [
    'img.kwcdn.com',       # Temu
    'ae01.alicdn.com',     # 速卖通
    'cbu01.alicdn.com',    # 1688
    'm.media-amazon.com',  # Amazon
    'cdn.shopify.com',     # Shopify
    'images-na.ssl-images-amazon.com',
]
SKIP_DOMAINS = ['google', 'gstatic', 'googleapis', 'googleusercontent', 'ggpht', 'ytimg']


def name_to_en(name):
    for zh, en in NAME_TO_EN.items():
        if zh in name:
            return en
    parts = re.findall(r'[a-zA-Z]{3,}', name)
    return " ".join(parts) + " product" if parts else name + " product"


def fetch_google_images(keyword, count=8):
    """从 Google Images 的 script 块提取原图 URL"""
    try:
        from cloakbrowser import launch
    except ImportError:
        print("  [ERROR] pip install cloakbrowser")
        return []

    q = keyword
    search_url = f"https://www.google.com/search?tbm=isch&q={urllib.request.quote(q)}"

    browser = launch(
        headless=False,
        humanize=True,
        locale="en-US",
        timezone="America/New_York",
        args=["--fingerprint=20260520"],
    )
    page = browser.new_page()
    all_urls = []

    try:
        page.goto(search_url, timeout=25000)
        time.sleep(4)

        raw_urls = page.evaluate(r"""
            () => {
                const allText = Array.from(document.querySelectorAll('script'))
                    .map(s => s.textContent).join('\n');
                const found = [];
                const re = /https:\/\/[^\\"'\s\]]{40,}/g;
                let m;
                while ((m = re.exec(allText)) !== null && found.length < 60) {
                    let u = m[0].replace(/\\u003d/g,'=').replace(/\\u0026/g,'&')
                                .replace(/\\u003c/g,'<').replace(/\\u003e/g,'>');
                    // 只要图片格式的 URL
                    if (u.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
                        found.push(u);
                    }
                }
                return found;
            }
        """)

        # 优先选好 CDN，其次选其他
        good = [u for u in raw_urls if any(cdn in u for cdn in ['kwcdn', 'alicdn', 'amazon', 'shopify'])]
        others = [u for u in raw_urls if u not in good and not any(s in u for s in ['google', 'gstatic'])]
        all_urls = list(dict.fromkeys(good + others))[:count]

    except Exception as e:
        print(f"  [ERROR] {str(e)[:80]}")
    finally:
        browser.close()

    return all_urls


def download_image(url, save_path, min_kb=20):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
        if len(data) < min_kb * 1024:
            return False
        # 校验文件头是图片
        if not (data[:2] == b'\xff\xd8' or data[:4] == b'\x89PNG' or data[:4] == b'RIFF' or data[:4] == b'\x00\x00\x00\x18'):
            return False
        with open(save_path, "wb") as f:
            f.write(data)
        print(f"    OK {len(data)//1024}KB -> {os.path.basename(save_path)}")
        return True
    except Exception as e:
        print(f"    FAIL {str(e)[:60]}")
        return False


# ── 主流程 ──────────────────────────────────────────────────────

if not os.path.exists(BASE):
    print(f"[ERROR] 输出目录不存在: {BASE}")
    sys.exit(1)

products = sorted([d for d in os.listdir(BASE) if os.path.isdir(os.path.join(BASE, d))])
print(f"\n读取到 {len(products)} 个商品目录 ({date_str})")

for name in products:
    folder_path = os.path.join(BASE, name)
    img_dir = os.path.join(folder_path, "06_素材", "images")
    os.makedirs(img_dir, exist_ok=True)

    existing_prod = sorted([
        f for f in os.listdir(img_dir)
        if f.startswith("产品_") and f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
    ])
    if len(existing_prod) >= 2:
        print(f"\n[SKIP] {name}: 已有 {len(existing_prod)} 张产品图")
        continue

    print(f"\n{'='*55}")
    print(f"▶ {name}")

    en_kw = name_to_en(name)
    print(f"  关键词: {en_kw}")

    urls = fetch_google_images(en_kw, count=8)
    print(f"  有效 URL: {len(urls)}")

    if not urls:
        print(f"  [WARN] 未找到产品图")
        continue

    existing_nums = {int(re.search(r'(\d+)', f).group(1)) for f in existing_prod if re.search(r'(\d+)', f)}
    saved, idx = 0, 1
    for url in urls:
        if saved >= 2:
            break
        while idx in existing_nums:
            idx += 1
        dest = os.path.join(img_dir, f"产品_0{idx}.jpg")
        if download_image(url, dest):
            saved += 1
            idx += 1

    print(f"  新增: {saved} 张")
    time.sleep(1.5)

# ── 最终统计 ────────────────────────────────────────────────────
print(f"\n\n{'='*55}")
print(f"最终统计  ({date_str})")
print("=" * 55)
final_total = 0
for name in products:
    img_dir = os.path.join(BASE, name, "06_素材", "images")
    files = sorted(os.listdir(img_dir)) if os.path.exists(img_dir) else []
    prod_files = [f for f in files if f.startswith("产品_")]
    sizes = [f"{os.path.getsize(os.path.join(img_dir, fn))//1024}KB" for fn in prod_files]
    final_total += len(prod_files)
    status = "OK" if len(prod_files) >= 2 else ("△" if prod_files else "X")
    detail = " | ".join(f"{n}({s})" for n, s in zip(prod_files, sizes))
    print(f"  [{status}] {name}: {len(prod_files)}张  {detail}")
print(f"\n合计产品图: {final_total} 张")
