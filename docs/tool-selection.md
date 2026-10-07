# OCR 与 PDF 工具选型

核对日期：2026-10-07。场景：70×40 mm 的多语种图片型标签，选择文字、人工校正、替换和按原尺寸导出。没有一套 OCR 在所有语言、字号和版式上都能保证最准确；这里以本地部署、维护状态、许可、坐标可用性和实测为依据选择。

## 集成组合

| 环节 | 选择 | 原因 |
| --- | --- | --- |
| OCR | RapidOCR + ONNX Runtime，PP-OCR 模型 | 将 PaddleOCR 模型用于跨平台本地推理，输出文字、位置和置信度。使用维护中的 `rapidocr` 包。 |
| PDF 预览与 OCR 输入 | PDFium / pypdfium2 | Chromium 的 PDF 渲染引擎；统一渲染和坐标，采用宽松许可。 |
| PDF 保留与合并 | pypdf | 保留未修改页面及资源，在原 PDF 上合并替换层。 |
| 替换文字 | ReportLab + OFL 字体 | 新文字为嵌入字体的文本对象，支持中文和拉丁字符，保留物理尺寸。 |
| 界面 | React + Vite | 框选、校正、预览、撤销及多页编辑。预览调用同一导出管线。 |

[RapidOCR 官方安装说明](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/install/)说明旧 `rapidocr_onnxruntime` 等包正逐步退出维护，因此不采用旧包。[PaddleOCR 多语种模型文档](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html)说明不同语言组使用不同识别模型；软件提供语言选择，识别结果允许人工修正。模型的详细版本、下载和实测见 [OCR 集成说明](ocr-engine.md)。

[pypdfium2 官方说明](https://pypdfium2-team.github.io/pypdfium2/readme.html)介绍 PDFium 的渲染能力、许可和线程限制；调用集中加锁。[pypdf 官方合并示例](https://pypdf.readthedocs.io/en/latest/user/add-watermark.html)支持在原页面叠加新内容；[ReportLab 字体文档](https://docs.reportlab.com/reportlab/userguide/ch3_fonts/)说明 TrueType 字体嵌入。坐标和字体处理详见 [PDF 集成说明](pdf-engine.md)。

## 比较过的替代方案

| 工具 | 适用性与本次选择 |
| --- | --- |
| PaddleOCR 完整 Python 栈 | 官方模型丰富，但额外框架较大。本次经 RapidOCR + ONNX 集成模型，避免绑定完整 Paddle 运行环境。 |
| Tesseract | 成熟开源传统 OCR，可输出文字坐标。复杂多语种小标签仍需逐项对照实测；不默认增加第二套运行依赖。 |
| Apple Vision | 可用的 macOS 本地 OCR；平台限定，未作为软件跨平台默认引擎。 |
| PDF.js | Mozilla 维护的优秀浏览器阅读器；本次由后端统一渲染以保证 OCR、预览和导出坐标一致。 |
| PyMuPDF | 能力完整，但采用 AGPL / 商业双许可；本次采用宽松许可组合。 |
| Azure Document Intelligence / Google Document AI | 提供成熟文档 OCR 与多语种服务；依赖账号、凭据、计费和联网。列为未来可配置增强引擎，本次没有发送文件或集成未经配置的云服务。 |

官方来源：[Tesseract](https://tesseract-ocr.github.io/)、[Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images)、[PDF.js](https://mozilla.github.io/pdf.js/)、[PyMuPDF 许可](https://pymupdf.io/licensing)、[Azure Read](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept-read?view=doc-intel-4.0.0)、[Google Enterprise Document OCR](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr)。

## 能力边界

OCR 负责识别文字和位置，不会恢复丢失的原始字体、字距、图层与排版语义。图片型 PDF 的替换通过背景色覆盖旧字，再叠加新文字完成。它适合白底标签修改；复杂花纹背景需要另行修复。覆盖不是安全脱敏，原内容仍可存在于 PDF 底层。新字体仅近似匹配原图，需要检查字号、位置和换行；Arial 选项使用 OFL 的兼容字体 Arimo。

导出始终生成新文件。未修改内容和源 PDF 保留；在物理尺寸不变的前提下导出，打印时选择实际大小 / 100%。
