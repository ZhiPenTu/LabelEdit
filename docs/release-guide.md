# 开发、验证和正式发布

新底座支持 macOS 13+ Apple Silicon、Windows 10+ x64。旧 Tauri 用户手动安装，旧版下载继续保留。不要将 v0.2.0 发布到 Tauri 工作流。

## 本地开发

需要 Node 24、Python 3.12、Rust。普通插件用户不需要这些开发依赖。

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
python -m pip install -r requirements-dev.txt
python -m backend.ocr_service
npm run build:sandbox
# 设置环境变量 COMMERCE_BACKEND_RPC=1 后执行（PowerShell 使用 $env:COMMERCE_BACKEND_RPC='1'）
python scripts/build_backend.py --distpath resources/generated/plugins/official.labeledit/backend
npm run build
npm run platform:prepare
npm run desktop:start
```

`npm run desktop:dev` 启动开发前端和桌面壳。先准备资源；LabelEdit 仍使用插件内构建的 UI。`npm test`、`npm run test:platform`、`npm run test:desktop` 和 Python `pytest` 分别验证前端、真实内核/系统沙箱/打包 RPC、桌面和原 PDF 逻辑。CI 在 macOS arm64 与 Windows x64 构建并执行同样流程。GUI 对话框测试由测试代码替代选择结果，宿主权限和 IPC 仍真实执行。

## 公开发布配置

GitHub Secrets：`MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`、`COMMERCE_PLUGIN_SIGNING_KEY`（Ed25519 PKCS8 PEM）。Repository variable：`COMMERCE_PLUGIN_PUBLIC_KEY`（SPKI PEM）。私钥只保留在用户受保护的存储与 Secrets 中。remove.bg 密钥由用户在插件页面保存到系统凭据库，不放入 CI。

`release-commerce.yml` 会先拒绝缺少签名配置或标签不一致的构建，然后运行测试、签名全部运行资源、验证签名和 notarization、构建独立签名插件并生成各平台目录，最后发布 GitHub Release。更新说明取 `docs/releases/v<version>.md`；客户端只展示目标最新一版。

正式发布前手动完成最低支持系统安装、标准 Electron 更新（旧底座→新底座）、下载失败与恢复、真实 remove.bg 单图/缺少密钥/额度/取消/网络失败验收。标签发布只应在这些门槛通过后进行。当前证书和 API 凭据按用户决定稍后配置。

旧客户端仍请求 `releases/latest/download/latest.json`，所以每个新底座 Release 必须附带从 v0.1.5 原样复制的 Tauri `latest.json`；其中 URL、签名和版本继续指向 v0.1.5。新底座使用 Electron `latest.yml` / `latest-mac.yml`。不要把新底座版本写入旧清单。

发布目录后将生成的 `commerce-market.json` 内容更新到 `market/catalog.json`。后续独立插件发布只更新制品和此目录，无需底座重新发版。

## Harness 更新与回退演练

使用一次性分支/副本，固定候选 `@deepseek-ai/dsh`、`dsh-app-boot`、`dsh-launch-environment` 同一已发布版本，运行 `npm install --ignore-scripts` 并提交完整 lockfile。检查 `profile-boot`、Profile/Bundle patch 和 Cordis effect API；不得加载第三方代码进内核。

运行真实 `test:kernel`、完整 `test:platform` 与 `test:desktop`，两平台重新打包；记录系统服务、工具注册/调用/停用、文件/网络/凭据权限，以及 LabelEdit 和抠图回归。失败则恢复 package.json 和 lockfile、`npm ci`，重新执行同样测试确认回退。当前 0.2.1-alpha.1 为最新发布版本，可以用 0.2.0-rc.2→当前基线作为升级演练，但不等价于未来版本兼容承诺。
