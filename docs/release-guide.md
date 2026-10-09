# 开发、验证和正式发布

新底座支持 macOS 14+ Apple Silicon、Windows 10+ x64。旧 Tauri 用户手动安装。旧工程、发布工作流、下载与更新清单已按用户决定移除。

## 本地开发

需要 Node 24、Python 3.12、Rust。macOS 后端打包使用 uv 管理的独立 CPython 3.12.11，避免 framework 别名转成普通资源后导致代码签名结构冲突；CI 固定 uv 0.11.6，Windows 继续使用普通 Python 3.12。普通插件用户不需要这些开发依赖。

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run build:harness-native
python -m pip install -r requirements-dev.txt
python -m backend.ocr_service
npm run build:sandbox
# macOS 后端打包（Windows 使用 python scripts/build_backend.py）
uv python install 3.12.11
uv run --no-project --managed-python --python 3.12.11 python scripts/build_backend.py
npm run build
npm run platform:prepare
npm run desktop:start
```

`npm run desktop:dev` 启动开发前端和桌面壳。先准备资源；LabelEdit 仍使用插件内构建的 UI。`npm test`、`npm run test:platform`、`npm run test:desktop` 和 Python `pytest` 分别验证前端、真实内核/系统沙箱/打包 RPC、桌面和原 PDF 逻辑。CI 在 macOS arm64 与 Windows x64 构建并执行同样流程；打包后执行 `node scripts/test-packaged-desktop.mjs`，直接验证分发包内的内核、离线 OCR 和 PDF 保存。GUI 对话框测试由测试代码替代选择结果，宿主权限和 IPC 仍真实执行。

`node scripts/test-plugin-navigation.mjs` 在不接入调试器的应用中验证多插件页面和本地服务同时使用。Windows 本地 Node 插件使用宿主在任务根目录建立的私有运行资源副本，AppContainer 只取得该副本的只读权限，不能修改正在运行的桌面壳可执行文件及 DLL 的 ACL。缓存由宿主建立，重启时清理并从当前应用资源重建，插件无需自行安装运行时。

## GitHub 分发配置

按用户 2026-10-09 的补充决定，当前从 GitHub 发布未签名桌面安装包，不上架 App Store。Apple Developer ID、Apple 公证和 Windows 发布者证书不是当前发布前置条件。macOS Apple Silicon 使用运行所需的 ad-hoc 签名，不代表 Apple 认证了发布者；未签名 Windows 安装包和未经公证的 Mac 应用可能显示系统安全提示。

必需配置只有 GitHub Secret `COMMERCE_PLUGIN_SIGNING_KEY`（Ed25519 PKCS8 PEM）和 Repository variable `COMMERCE_PLUGIN_PUBLIC_KEY`（SPKI PEM），两者必须匹配。生产密钥已配置，私钥只保留在用户受保护的存储与 Secrets 中，不进入源码。插件市场签名和沙箱隔离仍为必需。remove.bg 密钥属于用户应用设置，不放入 CI，其真实 API 验收暂缓。

在 GitHub Actions 手动运行 `Release commerce desktop`，选择待验收源码分支，版本填写与 `package.json` 相同的值（当前 `0.2.2`），签名模式选择默认的 `unsigned`。此路径运行完整测试、打包和独立插件签名，只上传 `Commerce-macOS` / `Commerce-Windows` 验收制品，供下载并手动安装检查，不创建标签或公开 Release。手动任务仅具有仓库读取权限。

v0.2.1 起，打包验收先将完整应用复制到源码目录外，使用独立工作目录并清除 `NODE_PATH` / `NODE_OPTIONS` 后启动。不得让源码仓库中的依赖参与验收。Harness 启动接口的必需 peer dependencies 明确列入桌面生产依赖；缺失依赖必须导致这项验收失败。

`release-commerce.yml` 拒绝缺失或不匹配的插件密钥、验收版本与发布标签不一致的构建。完成最低支持系统验收后，推送匹配版本的 `v<version>` 标签，再重新构建并发布 GitHub Release；只有标签触发的发布任务具有仓库写入权限。标签发布读取 Repository variable `COMMERCE_DESKTOP_SIGNING`，未设置时默认 `unsigned`。更新说明取 `docs/releases/v<version>.md`。

未签名底座通过 GitHub 最新公开 Release API 检查更新，只展示该版日志；检查到适用当前系统的安装包后，打开固定仓库、对应版本的下载页供用户手动安装。没有公开版本、包尚未上传、网络失败和限流都有明确反馈，不自动重试，不执行自动下载或安装。最低支持系统验收包括 macOS 14/Windows 10 安装与真实沙箱、旧底座→新底座的手动安装更新、检查失败后的重试和已安装插件/配置保留。v0.2.0 已按用户发布指令公开；最低支持系统的手动验收仍未完成，不能标记为通过。

打包仍保留 Electron `latest.yml` / `latest-mac.yml`，供以后启用正式签名模式时使用，不再生成旧 Tauri 清单。发布后将生成的 `commerce-market.json` 内容更新到 `market/catalog.json`。后续独立插件发布只更新制品和此目录，无需底座重新发版。

## 可选的正式签名模式

以后需要正式代码签名时，另配 GitHub Secrets：`MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。当前 Windows 通道接收 PFX/P12；云签名证书需接入对应供应商流程。

手动工作流选择 `signed`，或将 Repository variable `COMMERCE_DESKTOP_SIGNING` 设为 `signed` 后进行标签发布。该模式缺少任何平台证书就拒绝构建，要求 Apple 公证和正式签名验证通过；使用 `electron-builder.signed.yml`，打包资源记载 `signed` 模式，客户端才启用标准 Electron 自动下载与安装。必须另行完成两平台真实签名/更新验收。签名模式不改变 GitHub 发布渠道，也不涉及 App Store 上架。

本地 `npm run build:desktop` 同样默认未签名。切换模式后必须重新运行 `platform:prepare`；`package-desktop.mjs` 会拒绝资源中的更新模式与打包模式不一致的构建，未签名模式忽略环境中的 Apple/Windows 证书，避免意外变成另一种安装包。

## Harness 更新与回退演练

使用一次性分支/副本，固定候选 `@deepseek-ai/dsh`、`dsh-app-boot`、`dsh-launch-environment` 同一已发布版本，运行 `npm install --ignore-scripts` 并提交完整 lockfile。检查 `profile-boot`、Profile/Bundle patch 和 Cordis effect API；不得加载第三方代码进内核。

运行真实 `test:kernel`、完整 `test:platform` 与 `test:desktop`，两平台重新打包；记录系统服务、工具注册/调用/停用、文件/网络/凭据权限，以及 LabelEdit 和抠图回归。失败则恢复 package.json 和 lockfile、`npm ci`，重新执行同样测试确认回退。当前 0.2.1-alpha.1 为最新发布版本，可以用 0.2.0-rc.2→当前基线作为升级演练，但不等价于未来版本兼容承诺。

## Electron 与原生内核适配

固定 Electron 44.0.0 与官方 `node-addon-require-builtin@0.1.6`，该组合在上游支持列表内。原生依赖官方 macOS 预编译包的最低部署版本为 15.0；构建时从固定上游提交（SHA-256 校验）编译未修改的 N-API 源码，目标为 macOS 14.0。原生源码不进入本仓库，也不在用户安装插件时编译。macOS 开发需 Xcode 命令行工具。全部随包 Mach-O 都检查实际部署版本，Electron 或适配器更新必须一起完成内核与桌面回归。

## 轻作更名兼容性

v0.2.2 起应用产品名为 Qingzuo、中文界面为轻作，macOS 应用包和 Windows 可执行文件随之更名。沿用原 appId、用户数据目录、插件 ID 与 CommerceTools 安装包文件名，旧版更新检查仍可发现新版本。LabelEdit 独立插件随新界面升级为 0.1.1。
