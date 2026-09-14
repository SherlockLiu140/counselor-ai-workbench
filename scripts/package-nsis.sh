#!/usr/bin/env bash
# 在 macOS / Linux 上交叉编译 Windows 安装包（NSIS 的 setup.exe）。
#
# 为什么需要这个脚本：
# Tauri 官方立场是「Windows 包在 Windows 上打」。但那需要一台装了
# VS 2022「使用 C++ 的桌面开发」的机器。实际上 Tauri 2 支持用 cargo-xwin
# 走 MSVC 目标交叉编译——xwin 会把 Windows SDK / CRT 的头文件与库下下来，
# 不用装 Visual Studio。这个脚本把那条路固化下来。
#
# 前置条件（脚本会自己检查）：
#   rustup target add x86_64-pc-windows-msvc
#   cargo install cargo-xwin --locked
#   brew install llvm        # 提供 llvm-rc，编译 .rc 资源（图标 / 版本信息）必需
#   brew install makensis    # 把编译产物包成 setup.exe
#
# 用法：
#   bash scripts/package-nsis.sh
#   bash scripts/package-nsis.sh --small           # 体积小的版本（WebView2 改为安装时联网下载）
#   bash scripts/package-nsis.sh --skip-frontend   # 复用已有的前端产物，不重跑 vite
#
# 已知坑（否则会白查半天）：makensis 编译 Unicode 安装包时，若 locale 不合法
# （LC_ALL/LANG 为 C 或空）会直接崩：
#   libc++abi: terminating due to uncaught exception of type std::bad_alloc
# 这是 NSIS 的已知 bug（sourceforge #1165），只在 macOS 上出现，与脚本内容无关
# ——连一个空 Section 都编不过。修法就是给一个带语言的 UTF-8 locale。
# 详见：https://sourceforge.net/p/nsis/bugs/1165/

set -euo pipefail

# NSIS bug #1165 的规避：必须在调用 makensis 前设好，否则 Unicode 安装包必崩。
export LC_ALL="${NSIS_LOCALE:-en_US.UTF-8}"
export LANG="${NSIS_LOCALE:-en_US.UTF-8}"

SKIP_FRONTEND=0
SMALL=0
for arg in "$@"; do
  case "$arg" in
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --small) SMALL=1 ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="x86_64-pc-windows-msvc"
OUT_DIR="$ROOT/src-tauri/target/$TARGET/release/bundle/nsis"
DIST_DIR="$ROOT/dist-desktop"

# ---------- 1. 前置检查 ----------
missing=()
rustup target list --installed | grep -qx "$TARGET" || missing+=("rustup target add $TARGET")
cargo xwin --version >/dev/null 2>&1 || missing+=("cargo install cargo-xwin --locked")
command -v makensis >/dev/null 2>&1 || missing+=("brew install makensis")

# llvm-rc 是 Homebrew 的 keg-only 包，不会进 PATH，这里手动兜上。
LLVM_BIN=""
for candidate in /opt/homebrew/opt/llvm/bin /usr/local/opt/llvm/bin /usr/lib/llvm/bin; do
  if [[ -x "$candidate/llvm-rc" ]]; then LLVM_BIN="$candidate"; break; fi
done
if [[ -z "$LLVM_BIN" ]] && command -v llvm-rc >/dev/null 2>&1; then
  LLVM_BIN="$(dirname "$(command -v llvm-rc)")"
fi
[[ -n "$LLVM_BIN" ]] || missing+=("brew install llvm")

if (( ${#missing[@]} )); then
  echo "✗ 还缺这些前置条件：" >&2
  for m in "${missing[@]}"; do echo "    $m" >&2; done
  exit 1
fi

# ---------- 2. 交叉编译 + 打包 ----------
echo "▸ 交叉编译 Windows（${TARGET}）"
echo "  资源编译器: $LLVM_BIN/llvm-rc"

cd "$ROOT"
# embed-resource 优先读 $RC —— 显式指定，免得它去猜宿主平台上有没有 rc.exe。
# 同理把 llvm 的 bin 放进 PATH，tauri-winres 自己也会去 which llvm-rc。
EXTRA_ARGS=()
if [[ $SKIP_FRONTEND -eq 1 ]]; then
  echo "  （--skip-frontend：复用已有 dist/，跳过前端构建）"
  EXTRA_ARGS+=(--config '{"build":{"beforeBuildCommand":""}}')
fi

# 默认沿用 tauri.conf.json 的 offlineInstaller：把 WebView2 离线包装进 setup.exe，
# 换来断网也能安装，代价是成品 200 MB 量级。
# --small 改成 downloadBootstrapper：只带一个几百 KB 的引导程序，
# 安装时按需下载 WebView2（Win11 与已更新的 Win10 通常本来就有），成品约几 MB。
if [[ $SMALL -eq 1 ]]; then
  echo "  （--small：WebView2 改为安装时联网下载）"
  EXTRA_ARGS+=(--config '{"bundle":{"windows":{"webviewInstallMode":{"type":"downloadBootstrapper"}}}}')
fi

# ${EXTRA_ARGS[@]:+...} 是 macOS 自带 bash 3.2 的写法：
# 空数组在 `set -u` 下直接取 "${EXTRA_ARGS[@]}" 会报 unbound variable。
PATH="$LLVM_BIN:$PATH" RC="$LLVM_BIN/llvm-rc" \
  npx tauri build --runner cargo-xwin --target "$TARGET" --bundles nsis \
  ${EXTRA_ARGS[@]:+"${EXTRA_ARGS[@]}"}

# ---------- 3. 自检 ----------
EXE="$(find "$OUT_DIR" -maxdepth 1 -name '*.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$EXE" ]]; then
  echo "✗ 没找到 setup.exe，检查上面的构建输出" >&2
  exit 1
fi

# 两个版本的文件名必须能区分，否则后打的会盖掉先打的。
PRODUCT="$(/usr/bin/python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['productName'])" "$ROOT/src-tauri/tauri.conf.json")"
VERSION="$(/usr/bin/python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$ROOT/src-tauri/tauri.conf.json")"
SUFFIX="$([[ $SMALL -eq 1 ]] && echo online || echo offline)"
NAMED="$DIST_DIR/${PRODUCT}_${VERSION}_x64-setup-${SUFFIX}.exe"

mkdir -p "$DIST_DIR"
cp -f "$EXE" "$NAMED"

echo
echo "▸ 校验"
# NSIS 的安装程序本身就是 32 位 PE（载荷仍是 64 位），file 报 Intel 80386 属正常。
echo "  类型: $(file -b "$EXE" | cut -c1-60)"
echo "  大小: $(du -h "$NAMED" | cut -f1)"
echo
echo "✓ 完成: $NAMED"
echo
echo "  注意：这是 Windows 包，本机（macOS）跑不起来，需要拷到 Windows 上装。"
