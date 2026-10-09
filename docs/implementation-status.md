# 实施状态与验收证据

任务依据：`commerce-plugin-platform-taskbook.md`。[v0.2.0 已在 GitHub 发布](https://github.com/ZhiPenTu/LabelEdit/releases/tag/v0.2.0)。本文件区分发布完成与真实验收，未经验证的能力不能勾选。

| 范围 | 当前证据 |
| --- | --- |
| 官方 Harness 内核 | 固定 0.2.1-alpha.1；真实 Profile 启动、7 个系统服务、工具服务调用和生命周期释放通过 Node 测试 |
| Electron 自有界面 | macOS arm64 与 Windows x64 CI 中工具中心、独立 WebContentsView 标签页及本地服务运行时的新工具页面通过真实应用和 Playwright Electron 测试；两平台完整打包应用的自有 UI、内核连接、沙箱 OCR 与 PDF 保存通过；未加载上游 UI |
| 插件安装和恢复 | 本地安装/持久化/启停/卸载/升级恢复，损坏与恶意 ZIP、签名校验、版本和依赖拒绝通过测试；真实 Electron 的签名市场安装/更新、错误签名保留原版及内核崩溃恢复通过（使用测试目录与制品） |
| macOS 沙箱 | 当前 macOS 27.0.1 arm64 真实进程阻止目录外读写、符号链接、直接联网和启动其他程序；不可用时拒绝运行 |
| Windows 沙箱 | Windows Server 2025 x64 CI 中真实 AppContainer 与 Job Object 进程阻止目录外读写、符号链接、直接联网和未授权程序；系统凭据直接读取被拒绝，低完整性工作目录及 SID ACL 清理回归通过；Windows 10 最低系统验收待进行 |
| LabelEdit | 构建输出的内部库及 Python 框架别名转为普通文件/目录，逐层拒绝外部、循环及损坏链接，保持插件 ZIP 不含链接；独立 ZIP 打包/解包后在真实沙箱中完成 PDF 上传、RapidOCR、文字修改、预览、导出尺寸与源文件不变回归；桌面导出保存通过 |
| 自制工具 | SDK 网页/本地模板在运行中的底座导入并完成调用，无需重编译底座；页面无法使用 Node；独立会话强制不可达代理并禁用非代理 WebRTC，真实 TCP/TURN 与 UDP/STUN 哨兵验证未收到插件连接；网络配置校验失败时阻止页面打开 |
| 凭据 | macOS Keychain 和 Windows Credential Manager 实测写入、读取、跨插件隔离及删除通过；实际沙箱进程无法读取宿主创建的测试条目，测试拒绝超时、崩溃及非凭据 API 错误的假阳性 |
| AI 抠图 | 模拟 API 测试通过缺少密钥、额度不足、取消、无自动重试、PNG 预览与保存；真实 remove.bg 调用待用户配置 |
| 市场 | 生产 Ed25519 密钥已配置；正式目录包含 LabelEdit 和 AI 抠图的 macOS arm64 / Windows x64 签名制品，随 v0.2.0 发布并接入客户端默认目录 |
| GitHub 更新和发布 | v0.2.0 的两平台构建、完整打包应用回归及公开发布通过；安装包、插件、SDK 与最新日志已上传。默认不要求 Apple/Windows 证书，底座手动更新；插件签名保持必需。手动工作流仅上传验收制品，版本标签才公开发布。正式签名保留为可选模式；最低支持系统安装升级实测尚待进行 |
| 上游升级 | 2026-10-09 在一次性环境完成 0.2.0-rc.2→0.2.1-alpha.1 的真实 Profile/Bundle/服务生命周期升级演练；当前基线的桌面与权限回归通过两平台 CI |

## 已通过的本地命令

- `npm run build`
- `npm test`：13 个前端测试。
- `python -m pytest -q`：11 个测试及 4 个子测试，包含 Python 框架资源转换与越界/循环链接拒绝。
- `npm run build:sandbox`，Windows `cargo check --target x86_64-pc-windows-gnu`。
- `npm run test:platform`：27 个测试：真实内核、进程沙箱、系统凭据、包管理、代理、打包 RPC、可选代码签名及 GitHub 手动更新回归。
- `node scripts/test-plugin-navigation.mjs`：不接入调试器的真实应用检查，连续并发打开网页工具，在本地服务运行时再打开工具，验证同一插件只有一个页面、WebRTC 的真实 TCP/UDP 请求被阻止及关闭后释放处理进程；Windows 额外检查桌面可执行文件 ACL 不受插件影响。
- `npm run test:desktop`：3 个测试：真实 Electron 导入、隔离（含 WebRTC TCP/UDP 探测）、标签页、离线 PDF 保存、模拟抠图保存、卸载凭据清理、市场恢复及未签名底座的最新日志/GitHub 下载页/拒绝自动安装/检查失败重试。
- `node scripts/test-packaged-desktop.mjs`：直接启动分发目录内的应用，验证工具中心、真实 Harness 内核、沙箱 OCR 与 PDF 保存；验证和正式发布 CI 都运行此检查。
- 2026-10-09 的未签名分发调整：在没有发布者证书的情况下生成 macOS arm64 DMG/ZIP；实际签名为 `adhoc`、无 Team ID。295 个随包 Mach-O 的 macOS 14 部署版本检查、生产市场公钥/更新模式/打包源码一致性检查，以及完整打包应用的手动更新页、内核、OCR 与 PDF 保存通过。本项不等于最低系统的用户安装验收。

## 尚未完成的用户验收

macOS 14 与 Windows 10 最低支持系统的沙箱、安装及 GitHub 手动更新回归尚未完成。v0.2.0 已按用户 2026-10-09 的发布指令公开，两平台 CI 的最新系统测试不等于最低系统验收。当前 GitHub 分发不要求 Apple Developer ID、notarization 或 Windows 发布者签名；remove.bg 真实 API 与额度验收暂缓。正式签名和标准自动更新仍是后续可选能力，不能将它们或真实 API 验收标记为已完成。

发布证据：[v0.2.0 工作流](https://github.com/ZhiPenTu/LabelEdit/actions/runs/37918154199) 的 macOS、Windows 打包和 publish 三个任务全部成功；公开 Release 包含 14 个文件，版本标签指向 `0d0c703`。后续市场目录独立维护，不修改已发布标签。

## 旧代码清理

已移除 Tauri Rust 工程与依赖、旧更新器界面和测试、旧 HTTP/uvicorn 服务、重复开发/打包/冒烟脚本。PDF/OCR 文档操作提取到 `backend/document_service.py`，唯一入口为沙箱 RPC；Electron 复用原图标。按用户补充决定移除旧公开下载与更新清单，旧源码文档与截图均移除。本地旧构建、旧版安装包、对比报告和临时目录也已清理。

## macOS 14 运行资源

当前独立 Python/OCR 运行资源的 267 个 Mach-O、完整 `.app` 的 295 个 Mach-O 部署版本检查通过，均支持部署目标 macOS 14.0。Electron 固定 44.0.0，与上游原生加载适配器支持的运行时指纹一致；原生适配器固定官方 0.1.6，macOS 从固定上游提交编译未修改源码，部署目标 14.0。该检查不等于在真实 macOS 14 上完成安装和沙箱验收。

完整安装包的 CI 构建暴露了 Python framework 普通资源布局无法重新 codesign 的问题。macOS 打包改用独立 CPython 3.12.11（uv 0.11.6 管理），打包入口提前拒绝 framework Python。临时构建环境使用真实解释器路径及链接，避免复制 standalone 可执行文件后无法定位 libpython；最终插件资源仍转为普通文件。插件制品不接受符号链接，不通过忽略运行资源签名绕过此问题。
