# OCR 引擎实现与核验

核对与实测日期：2026-10-09。默认引擎是维护中的 `rapidocr==3.9.2` + `onnxruntime==1.30.0` CPU（构建时检查实际 Mach-O 部署版本），显式固定 PP-OCRv5 mobile 检测及识别模型，不随 RapidOCR 的默认模型变化。软件提供拉丁语种 / 中文两种识别模式；这份标签包含英语、法语、意大利语、西班牙语及土耳其语，优先选择拉丁模型。中文模式适用于中英文字，不能替代拉丁模型的完整扩展字符覆盖。

## 官方资料与选择依据

| 方案 | 维护、语言、坐标与平台 | 许可与选择 |
| --- | --- | --- |
| RapidOCR / ONNX | [官方安装说明](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/install/)说明旧 `rapidocr_onnxruntime` 等包正逐步退出维护，开发继续在 `rapidocr`。支持 ONNX Runtime 本地推理，输出四边形文字框、识别内容及置信度；[官方参数](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/parameters/)支持模型、语言、坐标粒度和 CPU 线程配置。 | [RapidOCR Apache-2.0](https://github.com/RapidAI/RapidOCR/blob/main/LICENSE)，[ONNX Runtime MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)。本次集成并实测。 |
| PaddleOCR | [PP-OCRv5 多语种文档](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html)说明按语言组选识别模型；完整 Paddle 栈也提供检测和识别坐标。 | [PaddleOCR Apache-2.0](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)。通过 RapidOCR 使用其模型，不增加完整 Paddle 框架依赖。 |
| Tesseract | [官方项目](https://github.com/tesseract-ocr/tesseract)提供命令行和库；[TSV 输出](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html)含位置和置信度；[官方语言数据](https://tesseract-ocr.github.io/tessdoc/Data-Files.html)按语言安装。成熟跨平台方案，但需要另外安装二进制和 traineddata。 | [Apache-2.0](https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE)。本机未安装，不作为默认引擎。未对该标签做 Tesseract 准确率比较。 |
| Apple Vision | [官方文字识别接口](https://developer.apple.com/documentation/vision/recognizing-text-in-images)返回识别候选和矩形坐标；受 Apple 平台限制。 | Apple SDK，不能作为跨平台开源默认运行环境。本机 Swift 能列出中英文等支持语言，但在当前受限执行环境对样例执行识别返回 `nilError`，没有作为可用性占位。 |

[RapidOCR 官方 PP-OCRv5 用法](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/how_to_use_ppocrv5/)支持明确指定检测/识别版本、模型类型和语言。[官方模型清单](https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/default_models.yaml)提供固定版本地址及 SHA-256。当前上游同时提供更新的模型；本软件固定已实测的 PP-OCRv5 配置，后续升级应重复标签、多语种和导出验证。没有宣称所有场景下最高准确率。

## 安装、模型与离线运行

按 [开发指南](release-guide.md)安装 `requirements-dev.txt`，运行 `python -m backend.ocr_service`。使用 Python 3.12 创建隔离的 `.venv`，按 `requirements.txt` 安装固定依赖。首次安装需要联网下载 Python 包和下列模型，之后识别不发送图片到外部服务。依赖 wheel 与模型合计需要数百 MB 磁盘空间，耗时取决于网络。Linux / Windows 的 wheel 与系统要求需在对应平台另行验证；本次已验证 macOS arm64、Python 3.12.14。

| 用途 | 固定模型 |
| --- | --- |
| 文字检测 | `ch_PP-OCRv5_det_mobile.onnx` |
| 文字方向 | `ch_ppocr_mobile_v2.0_cls_mobile.onnx`（官方 PP-OCRv4 分类模型） |
| 拉丁识别 | `latin_PP-OCRv5_rec_mobile.onnx` |
| 中英识别 | `ch_PP-OCRv5_rec_mobile.onnx` |

模型来源固定为 RapidAI 在 ModelScope 的 `v3.9.2` 地址，由安装步骤逐文件验证官方 SHA-256；缓存位于 `.models`。安装生成 `.models/manifest.json`，记录地址、大小、校验值和包版本。模型本身不入 Git。运行时显式加载本地路径及模型内置字符字典，不触发默认模型下载；初始化核验本地模型校验值，关闭 ONNX Runtime telemetry，所有 OCR 调用使用 CPU 并集中加锁。

模型缺失、损坏和加载失败通过中文 JSON 错误说明返回；不会伪造识别结果。RPC `health` 显示包版本、各模型是否存在及就绪状态。原生文本 PDF 优先使用 PDFium 文字层，图片型 PDF 使用 600 DPI、最多 3200 万像素的渲染图执行 OCR。

## 样例实测

样例：`文具新大 70X40.pdf`，1 页，70×40 mm，整页 2478×1416 位图，没有文本层。600 DPI 渲染得到约 1654×945 像素。拉丁模型实测约 1.8 秒（含首次引擎初始化，机器和系统负载会影响耗时）；原始检测为 86 个框。相同基线、相邻或轻度重叠的小框合并为 41 个编辑区域，保留间隔较大的独立字段和分栏。

正确识别的代表内容包括 `Batch Number: SG250128`、`Production Date: 01/01/2026`、`Product Name: stationery`、`Şirketi` 和 `ÉLÉMENTS D'EMBALLAGE`。仍存在例如 `1er` / `ler`、土耳其语带点字符、断词和重复标点的错误，部分错误置信度也很高。中文模型在同一多语种样例中同样运行成功，但部分土耳其语字符弱于拉丁模型，因此不能凭“中文也支持英文”替代语言选择。

字号和字体是供人工调整的初始估计。OCR 不能从图片恢复原始字体、粗细、字距或图层。区域坐标统一为旋转后可见页面的左上原点、0–1 的矩形；倾斜文本先使用轴对齐区域并提示人工确认。软件使用背景色覆盖旧字，再叠加嵌入字体的新文字；花纹背景、图标交叠和特殊书写方向需要额外处理。预览与 PDF 导出使用同一渲染与合并管线。

## 已执行的集成验证

- 禁止 `requests` 与 RapidOCR 下载入口后，新进程从本地模型成功识别中英文合成图片，确认初始化和推理无需联网。
- 当前沙箱 RPC 回归导入真实标签，执行 OCR、修改批次文字、预览和导出；检查新文字、70×40 mm 页面尺寸与源文件不变。
- 无修改导出与原文件字节一致；空白编辑预览与原预览一致。非法文件返回 400，非本机 Origin 返回 403；模型缺失的 OCR 请求返回明确的 503 错误。
- 多次启动/关闭 TestClient 的临时文件生命周期验证通过；`pip check` 没有依赖冲突。PDF 几何、复杂样例和界面操作的后续测试见项目测试与 PDF 集成说明。
