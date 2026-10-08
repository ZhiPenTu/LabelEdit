import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UpdateNotifier } from "./UpdateNotifier";
import { DEFAULT_SYSTEM_INFO } from "../platform/backend";
import type { AppUpdater } from "../platform/useAppUpdater";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createMockUpdater(overrides: Partial<AppUpdater> = {}): AppUpdater {
  return {
    available: true,
    currentVersion: "0.1.5",
    latestVersion: "0.1.5",
    systemInfo: DEFAULT_SYSTEM_INFO,
    autoCheckEnabled: true,
    setAutoCheckEnabled: vi.fn(),
    update: null,
    visible: true,
    setVisible: vi.fn(),
    status: "idle",
    progress: 0,
    errorMessage: null,
    check: vi.fn(),
    install: vi.fn(),
    ...overrides,
  };
}

function createUpdate(version = "0.2.0", body: string | undefined = "新增自动更新卡片与OCR规格展示"): NonNullable<AppUpdater["update"]> {
  return {
    version,
    currentVersion: "0.1.5",
    body,
    date: "2026-10-08",
    target: "darwin-aarch64",
    raw: {},
    close: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
    downloadAndInstall: vi.fn(),
  } as unknown as NonNullable<AppUpdater["update"]>;
}

it("renders dual version cards and engine technical specs", () => {
  const updater = createMockUpdater();
  render(<UpdateNotifier updater={updater} />);

  expect(screen.getByTestId("current-version").textContent).toBe("v0.1.5");
  expect(screen.getByTestId("latest-version").textContent).toBe("v0.1.5");
  expect(screen.getByText(/RapidOCR v3.9.2/)).toBeTruthy();
  expect(screen.getByText(/PP-OCRv5 mobile/)).toBeTruthy();
  expect(screen.getByText(/ONNX Runtime v1.30.0/)).toBeTruthy();
  expect(screen.getByText(/PDFium \(v5.14.0\)/)).toBeTruthy();
  expect(screen.getByText(/pypdf v6.19.0/)).toBeTruthy();
  expect(screen.getByText(/ReportLab v5.0.1/)).toBeTruthy();
});

it("triggers manual check update on button click", () => {
  const check = vi.fn();
  const updater = createMockUpdater({ check });
  render(<UpdateNotifier updater={updater} />);

  const checkButton = screen.getByRole("button", { name: /检查更新/ });
  fireEvent.click(checkButton);
  expect(check).toHaveBeenCalledTimes(1);
});

it("displays update availability and install button when new version found", async () => {
  const install = vi.fn();
  const mockUpdate = createUpdate();
  const updater = createMockUpdater({
    update: mockUpdate,
    latestVersion: "0.2.0",
    install,
  });
  render(<UpdateNotifier updater={updater} />);

  expect(screen.getByTestId("latest-version").textContent).toBe("v0.2.0");
  expect(screen.getByText("可更新")).toBeTruthy();
  expect(await screen.findByText(/新增自动更新卡片与OCR规格展示/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "新版本变更日志" })).toBeTruthy();

  const installButton = screen.getByRole("button", { name: /立即更新并重启/ });
  fireEvent.click(installButton);
  expect(install).toHaveBeenCalledTimes(1);
});

it("formats the latest notes as Markdown and replaces them when a newer release is found", async () => {
  const { rerender } = render(<UpdateNotifier updater={createMockUpdater({
    update: createUpdate("0.2.0", "### 新增\n\n- 支持**文字拖动**\n- 修复字体预览"),
  })} />);
  const notes = screen.getByRole("region", { name: "v0.2.0 变更内容" });
  expect(await within(notes).findByRole("heading", { name: "新增" })).toBeTruthy();
  expect(within(notes).getAllByRole("listitem")).toHaveLength(2);
  expect(within(notes).getByText("文字拖动").tagName).toBe("STRONG");

  rerender(<UpdateNotifier updater={createMockUpdater({
    update: createUpdate("0.3.0", "### 修复\n\n- 改善导出质量"),
  })} />);
  const latestNotes = screen.getByRole("region", { name: "v0.3.0 变更内容" });
  expect(await within(latestNotes).findByText("改善导出质量")).toBeTruthy();
  expect(screen.queryByText("文字拖动")).toBeNull();
  expect(screen.queryByRole("region", { name: "v0.2.0 变更内容" })).toBeNull();
});

it.each(["idle", "upToDate"] as const)("hides release notes when no update is available (%s)", status => {
  render(<UpdateNotifier updater={createMockUpdater({ status })} />);
  expect(screen.queryByRole("heading", { name: "新版本变更日志" })).toBeNull();
});

it.each(["checking", "downloading", "error"] as const)("keeps detected release notes visible while %s", async status => {
  render(<UpdateNotifier updater={createMockUpdater({ status, update: createUpdate() })} />);
  expect(await within(screen.getByRole("region", { name: "v0.2.0 变更内容" })).findByText("新增自动更新卡片与OCR规格展示")).toBeTruthy();
});

it.each(["", "  \n "])("uses an honest fallback when release notes are blank", body => {
  render(<UpdateNotifier updater={createMockUpdater({ update: createUpdate("0.2.0", body) })} />);
  expect(screen.getByText("此版本暂未提供变更日志。")).toBeTruthy();
  expect(screen.queryByText("优化性能与体验改进。")).toBeNull();
});

it("does not interpret HTML or load images from release notes", async () => {
  render(<UpdateNotifier updater={createMockUpdater({
    update: createUpdate("0.2.0", "### 更新\n\n<script>alert('notes')</script>\n\n![preview](https://example.com/image.png)\n\n- 修复预览"),
  })} />);
  const notes = screen.getByRole("region", { name: "v0.2.0 变更内容" });
  expect(await within(notes).findByRole("listitem")).toBeTruthy();
  expect(notes.querySelector("script")).toBeNull();
  expect(notes.querySelector("img")).toBeNull();
});

it("shows downloading progress bar when updating", () => {
  const updater = createMockUpdater({
    status: "downloading",
    progress: 68,
  });
  render(<UpdateNotifier updater={updater} />);

  expect(screen.getByText(/正在下载并安装更新…/)).toBeTruthy();
  expect(screen.getAllByText(/68%/).length).toBeGreaterThanOrEqual(1);
});
