import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { AUTO_CHECK_KEY, useAppUpdater } from "./useAppUpdater";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(async () => "0.1.5") }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("./backend", async importOriginal => {
  const original = await importOriginal<typeof import("./backend")>();
  return { ...original, getBackendSystemInfo: vi.fn(async () => original.DEFAULT_SYSTEM_INFO) };
});

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(check).mockReset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("exposes only the latest detected release notes and clears them when no update is available", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  localStorage.setItem(AUTO_CHECK_KEY, "false");
  const first = { version: "0.2.0", body: "- 新增文字拖动", close: vi.fn(async () => {}) } as unknown as Update;
  const latest = { version: "0.3.0", body: "- 改善导出质量", close: vi.fn(async () => {}) } as unknown as Update;
  vi.mocked(check).mockResolvedValueOnce(first).mockResolvedValueOnce(latest).mockResolvedValueOnce(null);
  const { result } = renderHook(() => useAppUpdater());

  act(() => { result.current.check(); });
  await waitFor(() => expect(result.current.update?.body).toBe(first.body));
  expect(result.current.visible).toBe(true);

  act(() => { result.current.check(); });
  await waitFor(() => expect(result.current.update?.body).toBe(latest.body));
  expect(result.current.latestVersion).toBe("0.3.0");
  expect(first.close).toHaveBeenCalledOnce();

  act(() => { result.current.check(); });
  await waitFor(() => expect(result.current.status).toBe("upToDate"));
  expect(result.current.update).toBeNull();
  expect(latest.close).toHaveBeenCalledOnce();
});

it("initializes with default versions and reads auto-check preference", () => {
  const { result } = renderHook(() => useAppUpdater());
  expect(result.current.currentVersion).toBe("0.1.5");
  expect(result.current.latestVersion).toBe("0.1.5");
  expect(result.current.autoCheckEnabled).toBe(true);
  expect(result.current.systemInfo.tools.rapidocr).toBe("3.9.2");

  act(() => {
    result.current.setAutoCheckEnabled(false);
  });
  expect(result.current.autoCheckEnabled).toBe(false);
  expect(localStorage.getItem(AUTO_CHECK_KEY)).toBe("false");
});
