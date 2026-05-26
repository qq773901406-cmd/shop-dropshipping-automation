#!/bin/bash
# Amazon 商品高清图片批量下载脚本

BASE_DIR="d:/Product/output/2026-05-14"

# 将Amazon缩略图URL转为高清URL（替换尺寸参数）
make_hd_url() {
  echo "$1" | sed \
    's/_AC_UL[0-9]*_/_AC_SL1500_/g' | sed \
    's/_AC_UY[0-9]*_/_AC_SL1500_/g' | sed \
    's/_AC_SR[0-9]*,[0-9]*_/_AC_SL1500_/g' | sed \
    's/_SS[0-9]*_/_SL1500_/g' | sed \
    's/_SX[0-9]*_/_SL1500_/g' | sed \
    's/_UX[0-9]*_/_SL1500_/g'
}

# 下载单张图片（优先高清，回退原图）
download_img() {
  local url="$1"
  local out="$2"
  local hd_url
  hd_url=$(make_hd_url "$url")

  # 跳过非 media-amazon URL（如 SS200 的 PNG 广告图）
  if echo "$url" | grep -q "_SS200_\|11++B3A2"; then
    echo "SKIP (广告图): $url"
    return 1
  fi

  # 尝试高清URL
  http_code=$(curl -sL --max-time 20 -w "%{http_code}" -o "$out" "$hd_url" 2>/dev/null)
  if [ "$http_code" = "200" ]; then
    size=$(stat -c%s "$out" 2>/dev/null || echo "0")
    if [ "$size" -gt 20000 ]; then
      echo "OK HD ${size}B: $(basename $out)"
      return 0
    fi
  fi

  # 回退原始URL
  http_code=$(curl -sL --max-time 20 -w "%{http_code}" -o "$out" "$url" 2>/dev/null)
  if [ "$http_code" = "200" ]; then
    size=$(stat -c%s "$out" 2>/dev/null || echo "0")
    if [ "$size" -gt 5000 ]; then
      echo "OK ${size}B: $(basename $out)"
      return 0
    fi
  fi

  echo "FAIL: $url"
  return 1
}

# ===== 1. 包包-编织草帽斜挎包 =====
echo ""
echo ">>> 1/10 包包-编织草帽斜挎包"
DIR="$BASE_DIR/包包-编织草帽斜挎包"
URLS=(
  "https://m.media-amazon.com/images/I/61U+XrelNkL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61MfDK876XL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/81uOLIU-LgL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71sFoHs+0aL._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 2. 包包-软皮抽绳束口水桶包 =====
echo ""
echo ">>> 2/10 包包-软皮抽绳束口水桶包"
DIR="$BASE_DIR/包包-软皮抽绳束口水桶包"
URLS=(
  "https://m.media-amazon.com/images/I/81irVhgBv2L._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/81IeQwUKDxL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61TbZccq3-L._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/81irVhgBv2L._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 3. 女装-碎花泡泡袖短款上衣 =====
echo ""
echo ">>> 3/10 女装-碎花泡泡袖短款上衣"
DIR="$BASE_DIR/女装-碎花泡泡袖短款上衣"
URLS=(
  "https://m.media-amazon.com/images/I/81amS7xR7XL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/81hF2s3FHGL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71SUpgrXFdL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/817BaBz2HKL._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 4. 女鞋-方跟一字带凉鞋 =====
echo ""
echo ">>> 4/10 女鞋-方跟一字带凉鞋"
DIR="$BASE_DIR/女鞋-方跟一字带凉鞋"
URLS=(
  "https://m.media-amazon.com/images/I/61-JPuM4oqL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61Dp2f7FA6L._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71gXk60IUaL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61Upoo4mRoL._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 5. 宠物-硅胶洗澡按摩刷 =====
echo ""
echo ">>> 5/10 宠物-硅胶洗澡按摩刷"
DIR="$BASE_DIR/宠物-硅胶洗澡按摩刷"
URLS=(
  "https://m.media-amazon.com/images/I/51HKnES-0GL._AC_UY218_.jpg"
  "https://m.media-amazon.com/images/I/71ZCpGwIDcL._AC_UY218_.jpg"
  "https://m.media-amazon.com/images/I/51BHmGB-zRL._AC_UY218_.jpg"
  "https://m.media-amazon.com/images/I/41mQfK87rhL._AC_UY218_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 6. 户外-可折叠野餐垫 =====
echo ""
echo ">>> 6/10 户外-可折叠野餐垫"
DIR="$BASE_DIR/户外-可折叠野餐垫"
URLS=(
  "https://m.media-amazon.com/images/I/810lzatjbfL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61d8lw-GFqL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/81kchOj2ADL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71olJ8LPQQL._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 7. 数码-桌面迷你风扇 =====
echo ""
echo ">>> 7/10 数码-桌面迷你风扇"
DIR="$BASE_DIR/数码-桌面迷你风扇"
URLS=(
  "https://m.media-amazon.com/images/I/71HTftYEVTL._AC_UY218_.jpg"
  "https://m.media-amazon.com/images/I/81JALL7edlL._AC_UY218_.jpg"
  "https://m.media-amazon.com/images/I/71CtI9UUTEL._AC_UY218_.jpg"
  "https://m.media-amazon.com/images/I/71HTftYEVTL._AC_UY218_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 8. 男装-速干冰丝运动短裤 =====
echo ""
echo ">>> 8/10 男装-速干冰丝运动短裤"
DIR="$BASE_DIR/男装-速干冰丝运动短裤"
URLS=(
  "https://m.media-amazon.com/images/I/61yJd98QYVL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61jRJEcpiFL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71I5GcTWh4L._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61YW1IwTb5L._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 9. 男鞋-户外徒步沙漠靴 =====
echo ""
echo ">>> 9/10 男鞋-户外徒步沙漠靴"
DIR="$BASE_DIR/男鞋-户外徒步沙漠靴"
URLS=(
  "https://m.media-amazon.com/images/I/81tIpyUegRL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/813MprEGsgL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/713nKcpbhBL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/81tIpyUegRL._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

# ===== 10. 美妆-多功能美甲打磨机 =====
echo ""
echo ">>> 10/10 美妆-多功能美甲打磨机"
DIR="$BASE_DIR/美妆-多功能美甲打磨机"
URLS=(
  "https://m.media-amazon.com/images/I/71jKmMtvsZL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/61cU73CSEGS._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71MeSAHDDEL._AC_UL320_.jpg"
  "https://m.media-amazon.com/images/I/71jKmMtvsZL._AC_UL320_.jpg"
)
for i in 0 1 2 3; do
  download_img "${URLS[$i]}" "$DIR/货源_0$((i+1)).jpg"
done

echo ""
echo "=== 全部下载完成 ==="

# 验证文件大小
echo ""
echo "=== 文件大小验证 ==="
for dir in "$BASE_DIR"/*/; do
  name=$(basename "$dir")
  for i in 01 02 03 04; do
    file="${dir}货源_${i}.jpg"
    size=$(stat -c%s "$file" 2>/dev/null || echo "0")
    status="OK"
    [ "$size" -lt 30000 ] && status="小图警告"
    echo "$status | ${size}B | $name/货源_${i}.jpg"
  done
done
