# PDF 引擎选择与导出约定

调研日期：2026-10-07。此处“可靠”指在本地中文标签改字这一使用范围内，兼顾成熟度、渲染一致性、许可证、打印尺寸和原文件保留；没有跨所有 PDF 类型的绝对准确率排名。

| 工具 | 官方资料与能力 | 本项目决定 |
| --- | --- | --- |
| PDFium / pypdfium2 | [PDFium 官方仓库](https://github.com/chromium/pdfium)说明它是 Chromium 使用的 PDF 库。[pypdfium2 文档](https://pypdfium2-team.github.io/pypdfium2/readme.html)提供页面渲染、定位文字、宽泛的预编译平台支持；绑定采用 Apache-2.0 / BSD-3-Clause，PDFium 与附带依赖的许可证须随二进制分发。 | 用于后端页面预览、OCR 输入与导出复查。调用用全局锁串行化，因为 PDFium 官方文档明确其不是线程安全的。 |
| PDF.js | [Mozilla 官方主页](https://mozilla.github.io/pdf.js/)说明它是浏览器 PDF 阅读器，采用 Apache 2.0。 | 适合以后扩展完整浏览器阅读功能；当前统一使用后端图像，以保持 OCR、预览和编辑坐标一致。 |
| pypdf | [官方项目定义](https://github.com/py-pdf/pypdf/blob/main/pyproject.toml)采用 BSD-3-Clause；[覆盖页面文档](https://pypdf.readthedocs.io/en/latest/user/add-watermark.html)支持在原页面上合并覆盖层及坐标变换。 | 克隆原文档，仅为修改页合并覆盖层，保留原页面资源、页面框、旋转和未改内容。 |
| ReportLab 开源 Toolkit | [官方许可 FAQ](https://docs.reportlab.com/developerfaqs/)说明开源版采用 BSD；[字体文档](https://docs.reportlab.com/reportlab/userguide/ch3_fonts/)支持 Unicode 和嵌入 TrueType 字体。 | 生成可选择、可搜索的矢量新文字和纯色覆盖区域。 |
| PyMuPDF | [官方许可说明](https://pymupdf.io/licensing)提供 AGPL 与商业许可；具有成熟的综合 PDF 处理能力。 | 暂不作为默认依赖，以保持当前软件选定的宽松许可依赖组合。需要其完整编辑能力时再评估软件许可或商业授权。 |

## 字体

项目随附 Google Fonts 官方仓库的 [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) 与 [Arimo](https://github.com/google/fonts/tree/main/ofl/arimo)。使用 `fontTools.varLib.instancer` 从可变字体生成字重 400、700 的静态 TrueType 字体。对应 SIL Open Font License 1.1 随文件保存在 `backend/fonts/*-OFL.txt`；原项目保留所有权，字体不可独立出售。

用户选择 Arial 时，导出使用 Arimo 作为替代字形，并不附带微软 Arial。中文缺字时自动使用 Noto Sans SC。导出字体按实际使用字形嵌入 PDF，支持中文、ASCII 和土耳其字符。不能提供的字形会返回可理解的错误，而不会静默输出方框。扫描标签无法恢复原设计字体，输出前应使用预览核对字形、字号和文字区域。

## 坐标与编辑

- `page` 是从 0 开始的页码。
- `rect` 的 `x/y/width/height` 是相对旋转后的可见 CropBox 的比例，原点在展示页面左上；值范围为 0 到 1，整个区域须处于页面内。
- `font_size` 是物理 PDF pt，1 pt = 1/72 英寸。页面的 `/UserUnit` 会参与物理尺寸换算。
- 页面内部绘制矩阵把展示坐标变换回原页面坐标，支持 0/90/180/270 度旋转及非零 CropBox 原点。无须重新生成整张页面。
- `fit=true` 自动换行并在需要时缩小字号；`fit=false` 遇到溢出即报错。换行、长单词和中文字符均参与真实字体宽度测量。
- `text_color` 与 `background_color` 使用 `#RRGGBB`。背景覆盖只作用于所选矩形，适用于白色/纯色标签。复杂图片背景需要额外的背景修复能力；本版本不自动生成图像补全结果。
- 文字删除传空字符串。没有任何修改时，导出字节与原文件完全一致。

覆盖改字会保留原页面内容在底层。它用于外观编辑，不用于删除敏感数据。签名文档的修改会影响签名验证，不能把编辑后文件当作仍保有原签名效力的文件。

## 接口

`backend/pdf_service.py` 提供：

```python
inspect_pdf(path) -> {"page_count": int, "pages": [page_geometry]}
render_page(path, page=0, dpi=450) -> PIL.Image.Image
extract_native_regions(path, page=0) -> list[region]
export_pdf(path, edits) -> bytes
```

真正的文字层先定位读取；纯图片页面由 OCR 识别并产生同一 `region` 结构。导出使用用户最终确认的 `edits`，不会把 OCR 原始结果全部重绘。

## 验证

`tests/test_pdf_service.py` 的三个集成测试验证实际 PDF：

1. 无修改字节一致；保留文档标题、页面尺寸、原文字和未修改页的内容流；中文与土耳其文字可提取，字体嵌入 FontFile2。
2. 非零 CropBox 原点配合四种旋转，以导出后渲染像素验证覆盖位置；页面框与旋转仍保持原值。
3. `/UserUnit=2` 的物理页面和渲染尺寸、溢出处理及非法坐标/颜色拒绝。

另外对工作区 70×40 mm 原始标签执行过临时日期及中文字替换，渲染后逐图核对，未修改原文件。导出页面仍为 70×40 mm，边框、图标、未修改文字与底图保留。覆盖区域需包住原字的全部笔画，尤其是英文字母下伸部。
