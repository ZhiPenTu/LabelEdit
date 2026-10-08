import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    currentVersion: "0.1.4",
    latestVersion: "0.1.4",
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

it("renders dual version cards and engine technical specs", () => {
  const updater = createMockUpdater();
  render(<UpdateNotifier updater={updater} />);

  expect(screen.getByTestId("current-version").textContent).toBe("v0.1.4");
  expect(screen.getByTestId("latest-version").textContent).toBe("v0.1.4");
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

it("displays update availability and install button when new version found", () => {
  const install = vi.fn();
  const mockUpdate = ({
    version: "0.2.0",
    currentVersion: "0.1.4",
    body: "新增自动更新卡片与OCR规格展示",
    date: "2026-10-08",
    target: "darwin-aarch64",
    raw: {} as any,
    close: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
    downloadAndInstall: vi.fn(),
  } as unknown as AppUpdater["update"]);
  const updater = createMockUpdater({
    update: mockUpdate,
    latestVersion: "0.2.0",
    install,
  });
  render(<UpdateNotifier updater={updater} />);

  expect(screen.getByTestId("latest-version").textContent).toBe("v0.2.0");
  expect(screen.getByText("可更新")).toBeTruthy();
  expect(screen.getByText(/新增自动更新卡片与OCR规格展示/)).toBeTruthy();

  const installButton = screen.getByRole("button", { name: /立即更新并重启/ });
  fireEvent.click(installButton);
  expect(install).toHaveBeenCalledTimes(1);
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
