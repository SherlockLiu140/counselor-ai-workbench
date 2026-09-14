#!/usr/bin/env bash
# 打 macOS 安装包（dmg）。
#
# 为什么不用 `npm run desktop:build`（即 `tauri build --bundles app,dmg`）：
# Tauri 内置的 bundle_dmg.sh 是 create-dmg 的 fork，在 macOS 27 上会挂：
# 它用 grep 去认「临时挂载的中间镜像」，传给 grep 的正则里方括号没转义，
#   grep: bad regex '/dev/disk5s': brackets ([ ]) not balanced
# 连试 9 次都失败，然后
#   ERROR: unable to proceed with final disk image creation
# 直接退出；更麻烦的是失败时它**不卸载**临时镜像，会在 /Volumes 下留一地残留，
# 下一次构建还会被这个残留干扰。
#
# 所以这里只让 tauri 出 .app（这一步是好的），dmg 自己拼：
#   .app + 指向 /Applications 的软链 → hdiutil 一步压成只读镜像。
# 代价是没有 Finder 窗口美化（那块靠 osascript 操作 Finder，本来也最容易失败）；
# 换来的是稳定、可重复、失败不留残留。
#
# 用法：
#   bash scripts/package-dmg.sh                                  # 本机架构：构建 + 打包
#   bash scripts/package-dmg.sh --no-build                       # 用已有的 .app 直接打包（快）
#   bash scripts/package-dmg.sh --target universal-apple-darwin  # Intel + Apple Silicon 合一（较慢）
#   bash scripts/package-dmg.sh --no-build --target aarch64-apple-darwin
#
# universal 包需要先装 Intel 目标：rustup target add x86_64-apple-darwin

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/src-tauri/tauri.conf.json"
OUT_DIR="$ROOT/dist-desktop"

PY=/usr/bin/python3
read_conf() { "$PY" -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$CONF" "$1"; }

usage() {
  cat <<'TXT'
用法：bash scripts/package-dmg.sh [--no-build] [--target <rust-triple>]

  （无参数）                        本机架构：构建 .app 后打包 dmg
  --no-build                        跳过构建，用已有的 .app 直接打包
  --target universal-apple-darwin   Intel + Apple Silicon 合一（较慢）
  --target aarch64-apple-darwin     仅 Apple Silicon
  --target x86_64-apple-darwin      仅 Intel

  universal 包需要先执行：rustup target add x86_64-apple-darwin
TXT
}

# ---------- 0. 参数 ----------
DO_BUILD=1
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    --target)   TARGET="${2:-}"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "未知参数：$1（用 --help 看用法）" >&2; exit 2 ;;
  esac
done

PRODUCT="$(read_conf productName)"
VERSION="$(read_conf version)"

# 产物目录：cross/universal 构建落在 target/<triple>/release，原生落在 target/release
if [[ -n "$TARGET" ]]; then
  BUNDLE_DIR="$ROOT/src-tauri/target/$TARGET/release/bundle"
else
  BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle"
fi
APP="$BUNDLE_DIR/macos/$PRODUCT.app"

# 文件名里的架构标签：给人看的，别用裸 triple
case "${TARGET:-$(uname -m)}" in
  universal-apple-darwin)               ARCH="universal" ;;
  aarch64-apple-darwin | arm64)         ARCH="arm64" ;;
  x86_64-apple-darwin | x86_64)         ARCH="x64" ;;
  *)                                    ARCH="${TARGET:-$(uname -m)}" ;;
esac
DMG="$OUT_DIR/${PRODUCT}_${VERSION}_${ARCH}.dmg"

# ---------- 1. 前置检查 ----------
if [[ "$TARGET" == "universal-apple-darwin" ]]; then
  installed="$(rustup target list --installed)"
  for t in aarch64-apple-darwin x86_64-apple-darwin; do
    if ! grep -qx "$t" <<< "$installed"; then
      echo "✗ 缺 Rust 目标 ${t}，先执行：rustup target add ${t}" >&2
      exit 1
    fi
  done
fi

# ---------- 2. 构建 .app ----------
if [[ $DO_BUILD -eq 1 ]]; then
  echo "▸ 构建 .app（前端 + Rust release）${TARGET:+ → $TARGET}"
  if [[ -n "$TARGET" ]]; then
    (cd "$ROOT" && npx tauri build --bundles app --target "$TARGET")
  else
    (cd "$ROOT" && npx tauri build --bundles app)
  fi
fi

if [[ ! -d "$APP" ]]; then
  echo "✗ 找不到 $APP" >&2
  echo "  先跑一次不带 --no-build 的构建，或检查 --target 是否写对。" >&2
  exit 1
fi

# ---------- 3. 收拾现场 ----------
# 上一次失败可能留下挂载点；挂载着的盘会让 hdiutil create 报 EBUSY。
orphans="$(hdiutil info | grep -o '/Volumes/dmg\.[A-Za-z0-9]*' || true)"
if [[ -n "$orphans" ]]; then
  echo "▸ 清理上次残留的挂载点"
  while read -r vol; do
    [[ -z "$vol" ]] && continue
    echo "  - $vol"
    hdiutil detach "$vol" -force >/dev/null 2>&1 || true
  done <<< "$orphans"
fi
rm -f "$BUNDLE_DIR"/macos/rw.*.dmg

# ---------- 4. 组装 dmg 内容 ----------
STAGE="$(mktemp -d /tmp/dmg-stage.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

echo "▸ 组装镜像内容"
ditto "$APP" "$STAGE/$PRODUCT.app"
ln -s /Applications "$STAGE/Applications"

# ---------- 5. 压成只读镜像 ----------
mkdir -p "$OUT_DIR"
rm -f "$DMG"

echo "▸ 生成 $DMG"
hdiutil create \
  -volname "$PRODUCT" \
  -srcfolder "$STAGE" \
  -ov -format UDZO -quiet \
  "$DMG"

# ---------- 6. 自检 ----------
echo "▸ 校验"
hdiutil verify "$DMG" >/dev/null && echo "  镜像: checksum VALID"
codesign --verify --deep --strict "$APP" && echo "  签名: 通过（ad-hoc，未公证）"

BIN="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
echo "  架构: $(lipo -archs "$BIN")"
if [[ "$TARGET" == "universal-apple-darwin" ]]; then
  archs="$(lipo -archs "$BIN")"
  if [[ "$archs" != *x86_64* || "$archs" != *arm64* ]]; then
    echo "  ✗ 期望双架构，实际只有：$archs" >&2
    exit 1
  fi
fi
echo "  大小: $(du -h "$DMG" | cut -f1)"

echo
echo "✓ 完成: $DMG"
