# 开发、验证和正式发布

新底座支持 macOS 14+ Apple Silicon、Windows 10+ x64。旧 Tauri 用户手动安装。旧工程、发布工作流、下载与更新清单已按用户决定移除。

## 本地开发

需要 Node 24、Python 3.12、Rust。普通插件用户不需要这些开发依赖。

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run build:harness-native
python -m pip install -r requirements-dev.txt
python -m backend.ocr_service
npm run build:sandbox
python scripts/build_backend.py
npm run build
npm run platform:prepare
npm run desktop:start
```

`npm run desktop:dev` 启动开发前端和桌面壳。先准备资源；LabelEdit 仍使用插件内构建的 UI。`npm test`、`npm run test:platform`、`npm run test:desktop` 和 Python `pytest` 分别验证前端、真实内核/系统沙箱/打包 RPC、桌面和原 PDF 逻辑。CI 在 macOS arm64 与 Windows x64 构建并执行同样流程；打包后执行 `node scripts/test-packaged-desktop.mjs`，直接验证分发包内的内核、离线 OCR 和 PDF 保存。GUI 对话框测试由测试代码替代选择结果，宿主权限和 IPC 仍真实执行。

`node scripts/test-plugin-navigation.mjs` 在不接入调试器的应用中验证多插件页面和本地服务同时使用。Windows 本地 Node 插件使用宿主在任务根目录建立的私有运行资源副本，AppContainer 只取得该副本的只读权限，不能修改正在运行的桌面壳可执行文件及 DLL 的 ACL。缓存由宿主建立，重启时清理并从当前应用资源重建，插件无需自行安装运行时。

## 公开发布配置

GitHub Secrets：`MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`、`COMMERCE_PLUGIN_SIGNING_KEY`（Ed25519 PKCS8 PEM）。Repository variable：`COMMERCE_PLUGIN_PUBLIC_KEY`（SPKI PEM）。私钥只保留在用户受保护的存储与 Secrets 中。remove.bg 密钥由用户在插件页面保存到系统凭据库，不放入 CI。

`release-commerce.yml` 会先拒绝缺少签名配置或标签不一致的构建，然后运行测试、签名全部运行资源、验证签名和 notarization、构建独立签名插件并生成各平台目录，最后发布 GitHub Release。更新说明取 `docs/releases/v<version>.md`；客户端只展示目标最新一版。

正式发布前手动完成最低支持系统安装、标准 Electron 更新（旧底座→新底座）、下载失败与恢复、真实 remove.bg 单图/缺少密钥/额度/取消/网络失败验收。标签发布只应在这些门槛通过后进行。当前证书和 API 凭据按用户决定稍后配置。

底座只发布 Electron `latest.yml` / `latest-mac.yml`，不再生成旧 Tauri 更新清单。

发布目录后将生成的 `commerce-market.json` 内容更新到 `market/catalog.json`。后续独立插件发布只更新制品和此目录，无需底座重新发版。

## Harness 更新与回退演练

使用一次性分支/副本，固定候选 `@deepseek-ai/dsh`、`dsh-app-boot`、`dsh-launch-environment` 同一已发布版本，运行 `npm install --ignore-scripts` 并提交完整 lockfile。检查 `profile-boot`、Profile/Bundle patch 和 Cordis effect API；不得加载第三方代码进内核。

运行真实 `test:kernel`、完整 `test:platform` 与 `test:desktop`，两平台重新打包；记录系统服务、工具注册/调用/停用、文件/网络/凭据权限，以及 LabelEdit 和抠图回归。失败则恢复 package.json 和 lockfile、`npm ci`，重新执行同样测试确认回退。当前 0.2.1-alpha.1 为最新发布版本，可以用 0.2.0-rc.2→当前基线作为升级演练，但不等价于未来版本兼容承诺。

## Electron 与原生内核适配

固定 Electron 44.0.0 与官方 `node-addon-require-builtin@0.1.6`，该组合在上游支持列表内。原生依赖官方 macOS 预编译包的最低部署版本为 15.0；构建时从固定上游提交（SHA-256 校验）编译未修改的 N-API 源码，目标为 macOS 14.0。原生源码不进入本仓库，也不在用户安装插件时编译。macOS 开发需 Xcode 命令行工具。全部随包 Mach-O 都检查实际部署版本，Electron 或适配器更新必须一起完成内核与桌面回归。
