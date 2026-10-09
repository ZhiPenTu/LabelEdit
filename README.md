# 电商工具中心 / LabelEdit

Electron + DeepSeek Harness 的电商插件服务统一入口。用户通过工具中心发现、安装、配置、使用和更新插件。LabelEdit 默认附带，支持离线 PDF/OCR 编辑；AI 抠图独立安装，使用用户自己的 remove.bg API 密钥。

[v0.2.1 下载与变更日志](https://github.com/ZhiPenTu/LabelEdit/releases/tag/v0.2.1)。修复 v0.2.0 安装后内核启动失败的问题。当前通过 GitHub 分发未签名安装包，不上架 App Store；Apple/Windows 发布者签名为后续可选能力。旧版下载与更新清单按用户决定移除，旧用户需手动安装新底座。

支持 macOS 14+ Apple Silicon 和 Windows 10+ x64。

- [最终目标任务书](docs/commerce-plugin-platform-taskbook.md)
- [实现状态和验收证据](docs/implementation-status.md)
- [开发、测试与发布](docs/release-guide.md)
- [插件 SDK 与开发模板](docs/plugin-development.md)
- [第三方声明](docs/third-party-notices.md)

## 开发与运行

开发需要 Node 24、Python 3.12、Rust。按发布指南安装依赖和 OCR 模型，然后执行：

```sh
npm run build:sandbox
python scripts/build_backend.py
npm run build
npm run platform:prepare
npm run desktop:start
```

`npm run desktop:dev` 启动开发前端与桌面壳。普通用户从安装包运行，无需安装 Node、Python 或包管理器。

## 插件与架构

底座直接依赖官方 `@deepseek-ai/dsh@0.2.1-alpha.1` 及完整锁定的依赖树，通过自定义 `commerce-desktop` Profile 和 Bundle 启动内核，自有 React 界面提供工具中心、市场、插件管理、设置和手动更新入口。

工具网页运行于独立、关闭 Node 集成的沙箱页面。本地程序经 macOS Seatbelt 或 Windows AppContainer + Job Object 启动；系统沙箱不可用时拒绝运行。文件、网络与凭据通过宿主代理授权，第三方代码不加载进内核进程。

`npm run plugin -- create my-tool` 创建网页插件；加 `--native` 创建本地处理模板。构建后的 ZIP 制品可本地导入，或通过签名市场独立安装和更新，无需重编译底座。首版市场提供目录与下载，不包含账号、支付或开发者自助发布。

LabelEdit 的 PDF、字体与离线 OCR 资源归插件所有，打开后按需启动 RPC 处理程序。旧 Tauri 壳、HTTP 服务、重复启动与打包脚本已清理；旧版下载与更新清单也已移除。

## LabelEdit 使用

1. 在工具中心打开 LabelEdit，选择 PDF 或使用示例标签。
2. 点选识别出的文字，或使用「框选区域」覆盖漏识别的文字。
3. 输入替换文字，调整字体、字号、加粗、文字颜色和背景颜色。
4. 应用修改并检查预览，可撤销或移除修改。
5. 导出 PDF 并选择保存位置。保留原页面尺寸，标签打印使用实际大小 / 100%，原文件不会被覆盖。

底座「更新」页面检查 GitHub 最新公开版本，只显示该版本的变更日志，并打开对应下载页供用户手动安装。插件仍通过签名校验独立安装和更新。主题支持浅色、深色与跟随系统，PDF 与导出颜色不受主题影响。

## 验证

```sh
npm test
npm run build
python -m pytest -q
npm run test:platform
npm run test:desktop
```

平台测试使用真实 Harness、系统沙箱、系统凭据库及打包 RPC。Electron 测试覆盖独立插件安装、隔离、工具标签页、离线 PDF 与模拟抠图保存。跨平台 CI 同时构建 macOS arm64 与 Windows x64；macOS 14 / Windows 10 最低支持系统的手动安装与升级尚待验收。remove.bg 真实 API 验收按用户决定暂缓。

## 开源协议

[MIT](LICENSE)。保留 DeepSeek Harness 与全部第三方声明。
