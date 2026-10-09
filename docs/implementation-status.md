# 实施状态与验收证据

任务依据：`commerce-plugin-platform-taskbook.md`。公开版本目标为 v0.2.0。本文件区分代码完成与真实验收，未经验证的发布门槛不能勾选。

| 范围 | 当前证据 |
| --- | --- |
| 官方 Harness 内核 | 固定 0.2.1-alpha.1；真实 Profile 启动、7 个系统服务、工具服务调用和生命周期释放通过 Node 测试 |
| Electron 自有界面 | macOS arm64 与 Windows x64 CI 中工具中心、独立 WebContentsView 标签页及本地服务运行时的新工具页面通过真实应用和 Playwright Electron 测试；两平台完整打包应用的自有 UI、内核连接、沙箱 OCR 与 PDF 保存通过；未加载上游 UI |
| 插件安装和恢复 | 本地安装/持久化/启停/卸载/升级恢复，损坏与恶意 ZIP、签名校验、版本和依赖拒绝通过测试；真实 Electron 的签名市场安装/更新、错误签名保留原版及内核崩溃恢复通过（使用测试目录与制品） |
| macOS 沙箱 | 当前 macOS 27.0.1 arm64 真实进程阻止目录外读写、符号链接、直接联网和启动其他程序；不可用时拒绝运行 |
| Windows 沙箱 | Windows Server 2025 x64 CI 中真实 AppContainer 与 Job Object 进程阻止目录外读写、符号链接、直接联网和未授权程序；系统凭据直接读取被拒绝，低完整性工作目录及 SID ACL 清理回归通过；Windows 10 最低系统验收待进行 |
| LabelEdit | 构建输出的内部库链接转为普通文件，保持插件 ZIP 不含链接；独立 ZIP 打包/解包后在真实沙箱中完成 PDF 上传、RapidOCR、文字修改、预览、导出尺寸与源文件不变回归；桌面导出保存通过 |
| 自制工具 | SDK 网页/本地模板在运行中的底座导入并完成调用，无需重编译底座；页面无法使用 Node；独立会话强制不可达代理并禁用非代理 WebRTC，真实 TCP/TURN 与 UDP/STUN 哨兵验证未收到插件连接；网络配置校验失败时阻止页面打开 |
| 凭据 | macOS Keychain 和 Windows Credential Manager 实测写入、读取、跨插件隔离及删除通过；实际沙箱进程无法读取宿主创建的测试条目，测试拒绝超时、崩溃及非凭据 API 错误的假阳性 |
| AI 抠图 | 模拟 API 测试通过缺少密钥、额度不足、取消、无自动重试、PNG 预览与保存；真实 remove.bg 调用待用户配置 |
| 市场 | 线上目录、签名制品与发布工具完成；生产签名密钥和正式目录内容尚待发布 |
| 正式更新和发布 | Electron 标准更新、最新日志、签名预检和发布 CI 完成；正式签名/安装升级实测尚待凭据 |
| 上游升级 | 2026-10-09 在一次性环境完成 0.2.0-rc.2→0.2.1-alpha.1 的真实 Profile/Bundle/服务生命周期升级演练；当前基线的桌面与权限回归通过两平台 CI |

## 已通过的本地命令

- `npm run build`
- `npm test`：13 个前端测试。
- `npm run build:sandbox`，Windows `cargo check --target x86_64-pc-windows-gnu`。
- `npm run test:platform`：21 个测试：真实内核、进程沙箱、系统凭据、包管理、代理及打包 RPC 回归。
- `node scripts/test-plugin-navigation.mjs`：不接入调试器的真实应用检查，连续并发打开网页工具，在本地服务运行时再打开工具，验证同一插件只有一个页面、WebRTC 的真实 TCP/UDP 请求被阻止及关闭后释放处理进程；Windows 额外检查桌面可执行文件 ACL 不受插件影响。
- `npm run test:desktop`：2 个测试：真实 Electron 导入、隔离（含 WebRTC TCP/UDP 探测）、标签页、离线 PDF 保存、模拟抠图保存、卸载凭据清理与市场恢复。
- `node scripts/test-packaged-desktop.mjs`：直接启动分发目录内的应用，验证工具中心、真实 Harness 内核、沙箱 OCR 与 PDF 保存；验证和正式发布 CI 都运行此检查。

## 尚未完成的公开发布门槛

Apple Developer ID、notarization 和 Windows 代码签名配置；remove.bg 真实 API 与额度验收；macOS 14 与 Windows 10 最低支持系统的沙箱、安装和标准更新回归。用户已确认稍后配置凭据，先完成实现与测试。当前验证制品不是正式公开发行版，不应标记全部五阶段验收完成。

## 旧代码清理

已移除 Tauri Rust 工程与依赖、旧更新器界面和测试、旧 HTTP/uvicorn 服务、重复开发/打包/冒烟脚本。PDF/OCR 文档操作提取到 `backend/document_service.py`，唯一入口为沙箱 RPC；Electron 复用原图标。按用户补充决定移除旧公开下载与更新清单，旧源码文档与截图均移除。本地旧构建、旧版安装包、对比报告和临时目录也已清理。

## macOS 14 运行资源

当前 Python/OCR 运行资源的 267 个 Mach-O 部署版本检查通过；完整 `.app` 的 295 个 Mach-O 均支持部署目标 macOS 14.0。数量包含已转换为普通文件的内部库别名。Electron 固定 44.0.0，与上游原生加载适配器支持的运行时指纹一致；原生适配器固定官方 0.1.6，macOS 从固定上游提交编译未修改源码，部署目标 14.0。该检查不等于在真实 macOS 14 上完成安装和沙箱验收。
