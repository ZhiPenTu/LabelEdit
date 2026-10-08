import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AUTO_CHECK_KEY, useAppUpdater } from "./useAppUpdater";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("initializes with default versions and reads auto-check preference", () => {
  const { result } = renderHook(() => useAppUpdater());
  expect(result.current.currentVersion).toBe("0.1.4");
  expect(result.current.latestVersion).toBe("0.1.4");
  expect(result.current.autoCheckEnabled).toBe(true);
  expect(result.current.systemInfo.tools.rapidocr).toBe("3.9.2");

  act(() => {
    result.current.setAutoCheckEnabled(false);
  });
  expect(result.current.autoCheckEnabled).toBe(false);
  expect(localStorage.getItem(AUTO_CHECK_KEY)).toBe("false");
});
