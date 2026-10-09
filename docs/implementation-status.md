# 实施状态与验收证据

任务依据：`commerce-plugin-platform-taskbook.md`。公开版本目标为 v0.2.0。本文件区分代码完成与真实验收，未经验证的发布门槛不能勾选。

| 范围 | 当前证据 |
| --- | --- |
| 官方 Harness 内核 | 固定 0.2.1-alpha.1；真实 Profile 启动、7 个系统服务、工具服务调用和生命周期释放通过 Node 测试 |
| Electron 自有界面 | macOS 实际启动，工具中心与独立 WebContentsView 标签页通过 Playwright Electron 测试；未加载上游 UI |
| 插件安装和恢复 | 本地安装/持久化/启停/卸载/升级恢复，损坏与恶意 ZIP、签名校验、版本和依赖拒绝通过测试；真实 Electron 的签名市场安装/更新、错误签名保留原版及内核崩溃恢复通过（使用测试目录与制品） |
| macOS 沙箱 | 当前 macOS 27.0.1 arm64 真实进程阻止目录外读写、符号链接、直接联网和启动其他程序；不可用时拒绝运行 |
| Windows 沙箱 | AppContainer、Job Object、低完整性工作目录和 SID ACL 清理代码完成；交叉编译通过，Windows CI 实测待记录 |
| LabelEdit | 打包后端在真实沙箱中完成 PDF 上传、RapidOCR、文字修改、预览、导出尺寸与源文件不变回归；桌面导出保存通过 |
| 自制工具 | SDK 网页/本地模板在运行中的底座导入并完成调用，无需重编译底座；页面无法使用 Node 或直接联网 |
| 凭据 | 当前 macOS 系统 Keychain 实测写入、读取、跨插件隔离和删除通过，仅使用测试值 |
| AI 抠图 | 模拟 API 测试通过缺少密钥、额度不足、取消、无自动重试、PNG 预览与保存；真实 remove.bg 调用待用户配置 |
| 市场 | 线上目录、签名制品与发布工具完成；生产签名密钥和正式目录内容尚待发布 |
| 正式更新和发布 | Electron 标准更新、最新日志、签名预检和发布 CI 完成；正式签名/安装升级实测尚待凭据 |
| 上游升级 | 当前基线是 npm 已发布最新版本；已在一次性环境完成 0.2.0-rc.2→0.2.1-alpha.1 的真实 Profile/Bundle/服务生命周期升级演练；完整当前基线的桌面与权限回归已通过本地测试，跨平台 CI 继续验证 |

## 已通过的本地命令

- `npm run build`
- `npm test`：当前前端测试（旧 Tauri 更新器测试已移除）。
- `npm run build:sandbox`，Windows `cargo check --target x86_64-pc-windows-gnu`。
- `npm run test:platform`：真实内核、进程沙箱、Keychain、包管理、代理及打包 RPC 回归。
- `npm run test:desktop`：真实 Electron 的导入、隔离、标签页、离线 PDF 保存及模拟抠图保存。

## 尚未完成的公开发布门槛

Apple Developer ID、notarization 和 Windows 代码签名配置；remove.bg 真实 API 与额度验收；Windows 真实进程/安装更新结果；macOS 14 最低支持版本的沙箱与安装回归。用户已确认稍后配置凭据，先完成实现与测试。当前验证制品不是正式公开发行版，不应标记全部五阶段验收完成。

## 旧代码清理

已移除 Tauri Rust 工程与依赖、旧更新器界面和测试、旧 HTTP/uvicorn 服务、重复开发/打包/冒烟脚本。PDF/OCR 文档操作提取到 `backend/document_service.py`，唯一入口为沙箱 RPC；Electron 复用原图标。按用户补充决定移除旧公开下载与更新清单，旧源码文档与截图均移除。
