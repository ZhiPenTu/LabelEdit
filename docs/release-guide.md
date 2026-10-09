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

版本规则：默认只递增最后一位补丁号，例如 `0.2.2 → 0.2.3`。未经用户明确许可，不得提升主版本号或次版本号；发布请求本身不代表允许大版本升级。

按用户 2026-10-09 的补充决定，当前从 GitHub 发布未签名桌面安装包，不上架 App Store。Apple Developer ID、Apple 公证和 Windows 发布者证书不是当前发布前置条件。macOS Apple Silicon 使用运行所需的 ad-hoc 签名，不代表 Apple 认证了发布者；未签名 Windows 安装包和未经公证的 Mac 应用可能显示系统安全提示。

必需配置只有 GitHub Secret `COMMERCE_PLUGIN_SIGNING_KEY`（Ed25519 PKCS8 PEM）和 Repository variable `COMMERCE_PLUGIN_PUBLIC_KEY`（SPKI PEM），两者必须匹配。生产密钥已配置，私钥只保留在用户受保护的存储与 Secrets 中，不进入源码。插件市场签名和沙箱隔离仍为必需。remove.bg 密钥属于用户应用设置，不放入 CI，其真实 API 验收暂缓。

在 GitHub Actions 手动运行 `Release commerce desktop`，选择待验收源码分支，版本填写与 `package.json` 相同的值（当前 `0.2.3`），签名模式选择默认的 `unsigned`。此路径运行完整测试、打包和独立插件签名，只上传 `Commerce-macOS` / `Commerce-Windows` 验收制品，供下载并手动安装检查，不创建标签或公开 Release。手动任务仅具有仓库读取权限。

v0.2.1 起，打包验收先将完整应用复制到源码目录外，使用独立工作目录并清除 `NODE_PATH` / `NODE_OPTIONS` 后启动。不得让源码仓库中的依赖参与验收。Harness 启动接口的必需 peer dependencies 明确列入桌面生产依赖；缺失依赖必须导致这项验收失败。

`release-commerce.yml` 拒绝缺失或不匹配的插件密钥、验收版本与发布标签不一致的构建。完成最低支持系统验收后，推送匹配版本的 `v<version>` 标签，再重新构建并发布 GitHub Release；只有标签触发的发布任务具有仓库写入权限。标签发布读取 Repository variable `COMMERCE_DESKTOP_SIGNING`，未设置时默认 `unsigned`。更新说明取 `docs/releases/v<version>.md`。

更新页在用户点击「下载并重启更新」后显示下载百分比及已下载大小，下载完成后自动安装并重启。未签名 macOS 底座从固定 GitHub 仓库读取最新正式 Release，只展示该版日志，选择 Apple Silicon ZIP，并流式校验 GitHub 提供的 SHA-256 和大小；随后用 ditto 解压，校验应用标识、版本及 ad-hoc 签名。独立助手等待旧进程退出，在同一文件系统替换应用，替换或启动交接失败时尝试恢复旧版，并在下次启动显示错误。Windows 和正式签名构建使用 electron-updater 的完整性/签名校验及安装流程，Windows 静默安装后自动运行。用户数据和插件保留在原目录。下载前提示保存文件；下载或校验失败可手动重试，切换页面不会中断更新。

macOS 必须从有写入权限的已安装应用目录更新；磁盘镜像、App Translocation 和只读目录会提示先移动应用。CI 必须保留 Mac ZIP、Windows EXE 和 latest*.yml；Mac ZIP 的 GitHub asset digest 及 size 必须有效，缺少校验信息时拒绝更新。旧版 v0.2.0–v0.2.2 不包含此下载逻辑，首次升级到包含此功能的版本仍需安装该版本一次。macOS 14/Windows 10 最低系统的真实安装升级验收仍未完成，不能标记为通过。

### 差量下载和组件复用（开发分支，尚未发布）

macOS 的更新顺序为签名组件清单、ZIP 差量下载、完整 ZIP。没有组件制品的旧 Release 仍可使用安装包路径。组件或差量不可用时显示回退说明；任何路径都必须通过最终大小、SHA-256、应用身份、版本和代码签名检查后才能安装。Windows 及正式签名构建继续使用 electron-updater 的原有安装通道，启用其差量下载；没有改写 Windows 安装器。

ZIP 和组件包在用户数据目录的 `updates/archives`、`updates/components` 中缓存。已完成缓存重新计算 SHA-256 后复用；中断的 `.part` 和差量 `.delta` 文件保留，手动重试时发送精确的 HTTP Range。服务器返回 200 或错误范围时重新下载，绝不将整个响应追加到已有分段。ZIP 差量要求此前通过校验的完整 ZIP 及对应 blockmap；首次启用且没有基线时需要下载一次安装包。成功后只保留当前/前一 ZIP 和当前组件缓存，七天前的其他残留分段会清理。

macOS 的 `asarUnpack` 将生产依赖单独存放，避免小幅界面改动使整个依赖包失效。Windows 保持原安装包布局。组件按最终完成代码签名的 `.app` 拆为 `core`、`electron`、`dependencies`、`ocr-runtime`、`ocr-models`、`plugin-ui`。主程序和 Helper 随应用版本/资源封印变化，归入 core；独立 Electron framework 才属于 electron。完整离线安装包继续包含所有运行资源和四个 OCR 模型。组件按组比较目标清单中的文件哈希、权限与链接，变化的组整体下载；本功能不是任意单文件补丁，也不在已安装应用上直接覆盖文件。

`scripts/component-artifacts.mjs` 生成六类 ZIP 和 `CommerceTools-<version>-mac-arm64.components.json`。清单包含产品、平台、版本、文件清单及各 ZIP 的 SHA-256/大小/固定仓库 URL；使用现有生产 Ed25519 密钥签名，签名消息带独立的组件更新域前缀，不能复用插件包签名。ZIP 仅包含哈希命名的普通文件，权限和安全的相对链接来自签名清单。客户端在暂存目录重建完整应用，再逐文件核对、验证 codesign，随后使用原有替换/重启/恢复助手。用户配置、独立安装插件及凭据目录不参与应用组件替换。

发布工作流在 Mac 构建中生成组件制品，运行 `node scripts/test-component-update.mjs --release-artifacts`，再与原 ZIP/DMG/EXE/blockmap/latest*.yml 一同上传和发布。该验收通过本地 HTTP 请求下载实际组件，只改变一次性副本的应用代码，并将重建应用复制到源码目录外验证真实 Harness、离线 OCR 和 PDF 保存。它验证组件下载与重建后的运行，不等于公开 GitHub 版本间的用户安装升级或最低系统验收。

本地无生产私钥时运行 `node scripts/test-component-update.mjs`，只在临时目录生成测试密钥与制品，不发布或修改安装中的应用。结果写入 `output/update-validation/components.json`。版本仍为 0.2.3；这项功能需要以后获准发布的补丁版本才能交付现有用户，首次迁移下载量和后续每次更新大小取决于发生变化的组件。

打包保留 Electron `latest.yml` / `latest-mac.yml`，供 Windows 和正式签名模式更新使用，不再生成旧 Tauri 清单。发布后将生成的 `commerce-market.json` 内容更新到 `market/catalog.json`。后续独立插件发布只更新制品和此目录，无需底座重新发版。

## 可选的正式签名模式

以后需要正式代码签名时，另配 GitHub Secrets：`MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。当前 Windows 通道接收 PFX/P12；云签名证书需接入对应供应商流程。

手动工作流选择 `signed`，或将 Repository variable `COMMERCE_DESKTOP_SIGNING` 设为 `signed` 后进行标签发布。该模式缺少任何平台证书就拒绝构建，要求 Apple 公证和正式签名验证通过；使用 `electron-builder.signed.yml`，打包资源记载 `signed` 模式，客户端使用要求发布者签名验证的标准 Electron 更新流程。必须另行完成两平台真实签名/更新验收。签名模式不改变 GitHub 发布渠道，也不涉及 App Store 上架。

本地 `npm run build:desktop` 同样默认未签名。切换模式后必须重新运行 `platform:prepare`；`package-desktop.mjs` 会拒绝资源中的更新模式与打包模式不一致的构建，未签名模式忽略环境中的 Apple/Windows 证书，避免意外变成另一种安装包。

## Harness 更新与回退演练

使用一次性分支/副本，固定候选 `@deepseek-ai/dsh`、`dsh-app-boot`、`dsh-launch-environment` 同一已发布版本，运行 `npm install --ignore-scripts` 并提交完整 lockfile。检查 `profile-boot`、Profile/Bundle patch 和 Cordis effect API；不得加载第三方代码进内核。

运行真实 `test:kernel`、完整 `test:platform` 与 `test:desktop`，两平台重新打包；记录系统服务、工具注册/调用/停用、文件/网络/凭据权限，以及 LabelEdit 和抠图回归。失败则恢复 package.json 和 lockfile、`npm ci`，重新执行同样测试确认回退。当前 0.2.1-alpha.1 为最新发布版本，可以用 0.2.0-rc.2→当前基线作为升级演练，但不等价于未来版本兼容承诺。

## Electron 与原生内核适配

固定 Electron 44.0.0 与官方 `node-addon-require-builtin@0.1.6`，该组合在上游支持列表内。原生依赖官方 macOS 预编译包的最低部署版本为 15.0；构建时从固定上游提交（SHA-256 校验）编译未修改的 N-API 源码，目标为 macOS 14.0。原生源码不进入本仓库，也不在用户安装插件时编译。macOS 开发需 Xcode 命令行工具。全部随包 Mach-O 都检查实际部署版本，Electron 或适配器更新必须一起完成内核与桌面回归。

## 轻作更名兼容性

v0.2.2 起应用产品名为 Qingzuo、中文界面为轻作，macOS 应用包和 Windows 可执行文件随之更名。沿用原 appId、用户数据目录、插件 ID 与 CommerceTools 安装包文件名，旧版更新检查仍可发现新版本。LabelEdit 独立插件随新界面升级为 0.1.1。
