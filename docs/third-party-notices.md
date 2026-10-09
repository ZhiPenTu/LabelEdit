# 第三方声明

本项目使用 MIT 许可。DeepSeek Harness 由 DeepSeek 提供，使用 MIT 许可；底座直接依赖官方发布的 `@deepseek-ai/dsh@0.2.1-alpha.1` 及其完整锁定依赖树。分发包包含 `DeepSeek-Harness-LICENSE` 原文和 `THIRD_PARTY_NOTICES.json` 中的生产 Node 依赖及随包许可文本。

Electron / Chromium / Node 的许可随 Electron 框架分发。LabelEdit 的 PDFium、pypdf、ReportLab、RapidOCR、ONNX Runtime、OpenCV 和 Python 依赖保留其 PyInstaller 收集的数据及许可；其功能与资源来源见 `pdf-engine.md` 和 `ocr-engine.md`。Arimo 与 Noto Sans SC 字体遵循 SIL Open Font License，原文随 LabelEdit 插件的 `backend/fonts/*-OFL.txt` 分发。remove.bg 是第三方在线服务，由用户配置自己的账户密钥和额度，图片处理适用其服务条款。

构建时由 `scripts/generate-notices.mjs` 生成安装依赖的许可清单，正式发布时应检查新增依赖的声明是否齐全。许可声明不表示第三方为本项目背书。

Harness 的原生加载适配器固定为官方 `node-addon-require-builtin@0.1.6`，macOS 构建使用 [上游源码提交 36e2a4c](https://github.com/deepseek-ai/dsh-node-addon-require-builtin/commit/36e2a4c9505fd4d05216f2fa9745676cd06d0012)，不修改原生源码。其 MIT 许可随包保存在 `Harness-native-adapter-LICENSE`。
