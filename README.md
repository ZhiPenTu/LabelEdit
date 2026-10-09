# 电商工具中心 / LabelEdit

Electron + DeepSeek Harness 的电商插件服务统一入口。工具中心、市场、插件管理、设置与更新使用自有界面；LabelEdit 默认附带，保留离线 PDF/OCR 编辑。AI 抠图作为独立插件，通过用户自己的 remove.bg API 密钥提供服务。

当前 v0.2.0 为开发目标，正式签名与发布验收尚未完成。已发布的 [LabelEdit v0.1.5](https://github.com/ZhiPenTu/LabelEdit/releases/tag/v0.1.5) 继续保留；旧用户需手动安装新底座。

- [最终目标任务书](docs/commerce-plugin-platform-taskbook.md)
- [实现状态和验收证据](docs/implementation-status.md)
- [开发、测试与发布](docs/release-guide.md)
- [插件 SDK 与开发模板](docs/plugin-development.md)
- [第三方声明](docs/third-party-notices.md)

底座使用官方 `@deepseek-ai/dsh@0.2.1-alpha.1` 发布包与自定义 commerce-desktop Profile，不加载上游默认 Web 产品界面。插件制品、生命周期和系统权限隔离分别处理；macOS 使用 Seatbelt，Windows 使用 AppContainer + Job Object，无不安全降级。

## 运行

按发布指南准备 RPC 后端、沙箱和插件资源，然后 `npm run desktop:start`。`npm run plugin -- create my-tool` 可创建插件，打包导入即可使用，无需重新发布底座。市场首版仅提供目录与安装，不包含账号、支付或开发者自助发布。

旧 Tauri 的开发脚本仍保留，`npm run tauri:dev` 可运行旧编辑器；旧发布工作流仅处理 `v0.1.*`。新底座采用独立 Electron 更新制品并保留兼容旧版的更新清单。

## 使用说明

1. 点击「打开 PDF」，或「使用示例标签」导入当前工作区的 70×40 mm 标签。
2. 识别完成后，点选左侧文字或画布上的识别框。也可切换「框选区域」拖出一个矩形，覆盖 OCR 漏识别的文字。
3. 在右侧输入替换文字，调整字体、字号、加粗、文字颜色和背景颜色。纯白标签选择白色背景；留空可清除区域。
4. 点击「应用修改」，确认实际导出管线生成的预览。可对照原稿、撤销或移除某项修改。
5. 点击「导出 PDF」下载新文件。保留原 PDF 页面尺寸，标签打印选择实际大小 / 100%。原文件不会被覆盖。
6. 点击顶栏「检查更新」可随时手动探测官方最新版本并升级。
7. 顶栏主题菜单支持浅色、深色与跟随系统，选择会本地保存。深色不会改变 PDF 页面和导出颜色。网页宽度不足 960 px 时，通过工具栏按钮打开文字列表与编辑面板。

---

## 依赖与打包

`requirements.txt` 仅包含运行依赖；开发与测试使用 `requirements-dev.txt`，打包使用 `requirements-build.txt`。macOS、Windows 和 CI 统一通过 `scripts/build_backend.py` 在独立的 `.venv-packaging` 中打包，保留四个离线 OCR 模型与完整字体，排除 OCR 默认模型和示例数据。

`.github/workflows/validate.yml` 只执行构建、测试与断网冒烟，不发布版本。正式发行仍使用 tag 触发的发布流程。

整理与 UI 迁移的[实测体积、回归流程和界面截图](docs/cleanup-validation.md)。

## 技术与架构

- **桌面宿主**：Tauri v2，提供轻量跨平台窗口、动态端口适配、防孤儿进程保护以及自动更新集成。
- **界面**：React 19、shadcn/ui `base-nova`（Base UI）、Tailwind CSS 4 和 Lucide。使用系统字体与本地保存的浅色/深色/系统主题。
- **OCR 引擎**：RapidOCR + ONNX Runtime；内置中英文 PP-OCRv5 离线模型，本地完全脱网运行。
- **PDF 引擎**：PDFium / pypdfium2 统一渲染，pypdf 保留原结构，ReportLab 输出嵌入字体的可选择新文字。
- **字体**：OFL 的 Arimo 与 Noto Sans SC。
- **打包分发**：PyInstaller 编译为原生独立二进制目录，内嵌至 Tauri App 资源目录中，用户端无需安装 Python 环境。

`useEditor` 协调 reducer 状态、异步操作和历史快照；`src/editor` 管理文档类型、坐标计算、预览 Blob 与画布交互；`src/platform` 管理后端连接和按需加载的桌面更新插件；各面板仅接收所需数据与动作。草稿独立于侧栏生命周期，位置变化不会清除尚未应用的文字和字体修改。

---

## 验证与测试

```bash
# 验证前端状态、交互与编译
npm run test
npm run build

# 验证后端单元测试
.venv/bin/python -m pytest -q

# 验证 Tauri Rust 核心编译
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 开源协议

本项目基于 [MIT 许可证](LICENSE) 开源。
