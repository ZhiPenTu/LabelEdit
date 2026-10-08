import { lazy, Suspense } from "react";
import { Cpu, Download, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Progress } from "./ui/progress";
import { cn } from "cn";
import type { AppUpdater } from "../platform/useAppUpdater";

const ReleaseNotes = lazy(() => import("./ReleaseNotes"));

export function UpdateNotifier({ updater }: { updater: AppUpdater }) {
  const {
    visible,
    setVisible,
    status,
    progress,
    errorMessage,
    update,
    install,
    currentVersion,
    latestVersion,
    systemInfo,
    autoCheckEnabled,
    setAutoCheckEnabled,
    check,
  } = updater;

  const title = "软件版本与自动更新";
  const desc =
    status === "error"
      ? (errorMessage || "检查更新失败，请重试。")
      : status === "upToDate"
      ? "您的 LabelEdit 已是最新发行版，所有离线引擎正常运行。"
      : status === "checking"
      ? "正在连接官方发布源检查最新版本…"
      : update
      ? `发现新版本 v${update.version}，可立即下载安装。`
      : "查看客户端与底层引擎规格，保持软件处于最新版本。";

  return (
    <Dialog open={visible} onOpenChange={open => { if (status !== "downloading") setVisible(open); }}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={status !== "downloading"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>

        {/* 双版本卡片（参考截图风格） */}
        <div className="grid grid-cols-2 gap-3" data-testid="version-cards">
          <div className="rounded-xl border bg-card p-4 shadow-2xs flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">当前版本</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">运行中</span>
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground" data-testid="current-version">
              v{currentVersion}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-2xs flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">最新版本</span>
              {status === "checking" ? (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">检查中…</span>
              ) : update ? (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">可更新</span>
              ) : status === "error" ? (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">检查失败</span>
              ) : (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">已是最新</span>
              )}
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground" data-testid="latest-version">
              v{status === "checking" ? "..." : (update?.version || latestVersion)}
            </div>
          </div>
        </div>

        {update ? (
          <section className="rounded-xl border bg-muted/30 p-3.5 flex flex-col gap-2.5" aria-labelledby="release-notes-title">
            <div className="flex items-center justify-between gap-2">
              <h3 id="release-notes-title" className="flex items-center gap-1.5 text-xs font-medium">
                <FileText className="size-3.5 text-primary" aria-hidden="true" />
                新版本变更日志
              </h3>
              <span className="text-xs font-mono text-muted-foreground">v{update.version}</span>
            </div>
            <div className="update-notes" role="region" aria-label={`v${update.version} 变更内容`} tabIndex={0}>
              {update.body?.trim() ? (
                <Suspense fallback={<p className="whitespace-pre-wrap">{update.body}</p>}>
                  <ReleaseNotes body={update.body} />
                </Suspense>
              ) : (
                <p>此版本暂未提供变更日志。</p>
              )}
            </div>
          </section>
        ) : null}

        {/* 底层引擎技术规格（用户明确要求的 OCR 引擎与 PDF 引擎版本） */}
        <div className="rounded-xl border bg-muted/30 p-3.5 flex flex-col gap-2.5 text-xs" data-testid="engine-specs">
          <div className="flex items-center justify-between text-muted-foreground font-medium pb-1 border-b border-border/50">
            <span>底层引擎技术规格</span>
            <span className="text-[11px]">本地离线推理</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-background/60 border border-border/40">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <Cpu className="size-3.5 text-primary" />
                <span>OCR 识别引擎</span>
              </div>
              <div className="text-muted-foreground space-y-0.5 text-[11px]">
                <div>核心: <span className="text-foreground font-medium">RapidOCR v{systemInfo.tools.rapidocr}</span></div>
                <div>模型: <span className="text-foreground font-medium">PP-OCRv5 mobile</span></div>
                <div>运行时: <span className="text-foreground font-medium">ONNX Runtime v{systemInfo.tools.onnxruntime}</span></div>
              </div>
            </div>

            <div className="flex flex-col gap-1 p-2 rounded-lg bg-background/60 border border-border/40">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" />
                <span>PDF 处理引擎</span>
              </div>
              <div className="text-muted-foreground space-y-0.5 text-[11px]">
                <div>渲染核心: <span className="text-foreground font-medium">PDFium (v{systemInfo.tools.pypdfium2})</span></div>
                <div>结构解析: <span className="text-foreground font-medium">pypdf v{systemInfo.tools.pypdf}</span></div>
                <div>矢量导出: <span className="text-foreground font-medium">ReportLab v{systemInfo.tools.reportlab}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* 自动检查更新开关 */}
        <div className="flex items-center justify-between px-1 py-0.5 text-xs">
          <label htmlFor="auto-update-toggle" className="flex items-center gap-2 cursor-pointer select-none text-foreground font-medium">
            <Checkbox
              id="auto-update-toggle"
              checked={autoCheckEnabled}
              onCheckedChange={checked => setAutoCheckEnabled(Boolean(checked))}
            />
            <span>启动应用时自动检测最新版本</span>
          </label>
          <span className="text-[11px] text-muted-foreground">静默探测官方版本</span>
        </div>

        {/* 下载进度条 */}
        {status === "downloading" ? (
          <div className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/40">
            <div className="flex justify-between text-xs font-medium">
              <span>正在下载并安装更新…</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} aria-label="更新下载进度" />
          </div>
        ) : null}

        {/* 错误提示 */}
        {status === "error" && errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
            {errorMessage}
          </div>
        ) : null}

        {/* 底部按钮栏（参考截图风格） */}
        <DialogFooter className="sm:justify-between items-center gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void check(); }}
              disabled={status === "downloading" || status === "checking"}
            >
              <RefreshCw className={cn("size-3.5", status === "checking" && "animate-spin")} data-icon="inline-start" />
              <span>{status === "checking" ? "正在检查…" : "检查更新"}</span>
            </Button>

            {update && status !== "downloading" ? (
              <Button
                size="sm"
                onClick={() => { void install(); }}
              >
                <Download className="size-3.5" data-icon="inline-start" />
                <span>立即更新并重启</span>
              </Button>
            ) : status === "downloading" ? (
              <Button size="sm" disabled>
                <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />
                <span>正在更新 ({progress}%)</span>
              </Button>
            ) : null}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisible(false)}
            disabled={status === "downloading"}
          >
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
