import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { DEFAULT_SYSTEM_INFO, getBackendSystemInfo, type SystemInfo } from "./backend";

export const AUTO_CHECK_KEY = "labeledit:auto-check-update";

function readAutoCheckPreference(): boolean {
  try {
    return localStorage.getItem(AUTO_CHECK_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useAppUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "downloading" | "upToDate" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState("0.1.4");
  const [latestVersion, setLatestVersion] = useState("0.1.4");
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(DEFAULT_SYSTEM_INFO);
  const [autoCheckEnabled, setAutoCheckEnabledState] = useState(readAutoCheckPreference);

  const mounted = useRef(false);
  const working = useRef(false);
  const updateRef = useRef<Update | null>(null);
  const available = isTauri();

  const setAutoCheckEnabled = useCallback((enabled: boolean) => {
    setAutoCheckEnabledState(enabled);
    try {
      localStorage.setItem(AUTO_CHECK_KEY, String(enabled));
    } catch {
      // storage unavailable
    }
  }, []);

  const refreshSystemInfo = useCallback(async () => {
    try {
      const info = await getBackendSystemInfo();
      if (mounted.current) setSystemInfo(info);
    } catch {
      // ignore
    }
  }, []);

  const performCheck = useCallback(async (silent = false) => {
    if (working.current) return;
    working.current = true;
    if (!silent) {
      setStatus("checking");
      setVisible(true);
    }
    void refreshSystemInfo();

    if (!isTauri()) {
      working.current = false;
      if (!silent) {
        setStatus("upToDate");
        setLatestVersion(currentVersion);
      }
      return;
    }

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const found = await check();
      if (!mounted.current) {
        await found?.close();
        return;
      }
      if (updateRef.current) await updateRef.current.close();
      updateRef.current = found;
      setUpdate(found);
      if (found) {
        setLatestVersion(found.version);
        setStatus("idle");
        setVisible(true);
      } else {
        setLatestVersion(currentVersion);
        if (!silent) setStatus("upToDate");
      }
    } catch (error) {
      if (!silent && mounted.current) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        const notFound = /was not found in the response|targets?notfound/i.test(message);
        setStatus(notFound ? "upToDate" : "error");
        if (notFound) {
          setLatestVersion(currentVersion);
        } else {
          setErrorMessage(/fetch|dns|network|timeout/i.test(message) ? "检查更新失败，请确认网络连接。" : message || "检查更新失败，请重试。");
        }
      }
    } finally {
      working.current = false;
    }
  }, [currentVersion, refreshSystemInfo]);

  useEffect(() => {
    mounted.current = true;
    void refreshSystemInfo();

    if (isTauri()) {
      import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(v => {
        if (mounted.current && v) {
          setCurrentVersion(v);
          setLatestVersion(prev => (prev === "0.1.4" ? v : prev));
        }
      }).catch(() => {});
    }

    const timer = (available && autoCheckEnabled) ? setTimeout(() => {
      void performCheck(true);
    }, 3000) : undefined;

    return () => {
      mounted.current = false;
      clearTimeout(timer);
      void updateRef.current?.close().catch(() => {});
      updateRef.current = null;
    };
  }, [autoCheckEnabled, available, performCheck, refreshSystemInfo]);

  async function install() {
    if (!updateRef.current || working.current) return;
    working.current = true;
    setStatus("downloading");
    setProgress(0);
    setErrorMessage(null);
    try {
      let downloaded = 0;
      let total = 0;
      await updateRef.current.downloadAndInstall(event => {
        if (!mounted.current) return;
        if (event.event === "Started") total = event.data.contentLength || 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total) setProgress(Math.min(100, Math.round(downloaded / total * 100)));
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      if (mounted.current) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "下载安装更新失败，请重试。");
      }
    } finally {
      working.current = false;
    }
  }

  return {
    available,
    currentVersion,
    latestVersion,
    systemInfo,
    autoCheckEnabled,
    setAutoCheckEnabled,
    update,
    visible,
    setVisible,
    status,
    progress,
    errorMessage,
    check: () => { void performCheck(false); },
    install,
  };
}

export type AppUpdater = ReturnType<typeof useAppUpdater>;
