# LabelEdit

本地 PDF 标签文字编辑器。面向图片型/扫描型 PDF 的日期、批次、名称、地址等修改，也能读取真实 PDF 文字层。使用实际 PDF 预览，支持 OCR 文字点选、手动框选、人工校正、字体/字号/颜色、多页编辑、撤销、导出。

支持以 **网页端** 或 **跨平台桌面端（macOS / Windows）** 运行，完全内置离线 OCR 识别引擎与 PDFium 渲染库，支持 GitHub Releases 自动检测与静默升级。

---

## 桌面端开发与运行

桌面端基于 **Tauri v2 + Python 独立后端进程 + React 19** 构建。

### 1. 开发模式启动

需要 Node.js 20.19+（推荐 22 LTS）、Python 3.12 及 Rust 工具链。

```bash
# 启动 Tauri 桌面端开发环境（自动拉起内置 Python 后端与 Vite 前端窗口）
npm run tauri:dev
# 或直接运行：
bash scripts/tauri-dev.sh
```

### 2. 本地一键打包

#### macOS (.dmg / .app)
在 macOS 环境下执行：
```bash
# 一键编译独立 Python 后端、Vite 前端并生成 macOS DMG 安装包
npm run build:desktop
# 或直接运行：
bash scripts/build-desktop-macos.sh
```
构建成功后，安装包生成于 `src-tauri/target/release/bundle/dmg/`。

#### Windows (.exe / NSIS 安装向导)
在 Windows 环境下打开 CMD 或 PowerShell 执行：
```bat
scripts\build-desktop-windows.bat
```
构建成功后，安装包生成于 `src-tauri\target\release\bundle\nsis\`。

### 3. GitHub Actions CI 跨平台自动化发布与更新

项目已配置 `.github/workflows/release.yml` 自动化发布管线：
1. 本地生成或指定版本 tag：`git tag v0.1.0 && git push origin v0.1.0`。
2. GitHub CI 自动并行启动 `macos-latest` 与 `windows-latest` 虚拟机，编译独立离线后端、前端和桌面端壳。
3. 自动生成并签署更新清单 `latest.json`，并将 macOS `.dmg`、`.app.tar.gz` 和 Windows NSIS `.exe` 发布到 GitHub Releases。
4. 运行中的桌面端启动时将在后台静默检测，有新版本时弹出更新提示并支持一键下载、安装与重启。

*注：GitHub 仓库需在 Settings -> Secrets and variables -> Actions 中配置 `TAURI_SIGNING_PRIVATE_KEY`（对应 `src-tauri/updater.key` 内容）以启用更新包数字签名。*

---

## 网页端模式启动

也可以作为纯浏览器服务启动：

```bash
bash scripts/setup-backend.sh
npm ci
bash scripts/dev.sh
```

打开 <http://127.0.0.1:5188>。后端监听 `127.0.0.1:8765`。

---

## 使用说明

1. 点击「打开 PDF」，或「使用示例标签」导入当前工作区的 70×40 mm 标签。
2. 识别完成后，点选左侧文字或画布上的识别框。也可切换「框选区域」拖出一个矩形，覆盖 OCR 漏识别的文字。
3. 在右侧输入替换文字，调整字体、字号、加粗、文字颜色和背景颜色。纯白标签选择白色背景；留空可清除区域。
4. 点击「应用修改」，确认实际导出管线生成的预览。可对照原稿、撤销或移除某项修改。
5. 点击「导出 PDF」下载新文件。保留原 PDF 页面尺寸，标签打印选择实际大小 / 100%。原文件不会被覆盖。
6. 点击顶栏「检查更新」可随时手动探测官方最新版本并升级。

---

## 技术与架构

- **桌面宿主**：Tauri v2，提供轻量跨平台窗口、动态端口适配、防孤儿进程保护以及自动更新集成。
- **OCR 引擎**：RapidOCR + ONNX Runtime；内置中英文 PP-OCRv5 离线模型，本地完全脱网运行。
- **PDF 引擎**：PDFium / pypdfium2 统一渲染，pypdf 保留原结构，ReportLab 输出嵌入字体的可选择新文字。
- **字体**：OFL 的 Arimo 与 Noto Sans SC。
- **打包分发**：PyInstaller 编译为原生独立二进制目录，内嵌至 Tauri App 资源目录中，用户端无需安装 Python 环境。

---

## 验证与测试

```bash
# 验证前端编译
npm run build

# 验证后端单元测试
.venv/bin/python -m pytest -q

# 验证 Tauri Rust 核心编译
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 开源协议

本项目基于 [MIT 许可证](LICENSE) 开源。
