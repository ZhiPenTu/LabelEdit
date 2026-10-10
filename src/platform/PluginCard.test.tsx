import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { PluginCard } from "./PluginCard";

describe("PluginCard update states and animations", () => {
  afterEach(() => { cleanup(); });
  const entry = {
    id: "official.labeledit",
    title: "LabelEdit",
    description: "本地 PDF 标签编辑",
    version: "0.2.0",
    category: "标签与文档",
  };

  it("renders update button when installed version is older", () => {
    const installed = {
      ...entry,
      version: "0.1.0",
      enabled: true,
      source: "market",
      local: false,
      missing: [],
    };
    render(
      <PluginCard
        entry={entry}
        installed={installed}
        mode="market"
        disabled={false}
        ready={true}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "更新插件" })).toBeTruthy();
  });

  it("shows animated progress and updating state when updating an installed plugin", () => {
    const installed = {
      ...entry,
      version: "0.1.0",
      enabled: true,
      source: "market",
      local: false,
      missing: [],
    };
    const { container } = render(
      <PluginCard
        entry={entry}
        installed={installed}
        mode="market"
        disabled={true}
        ready={true}
        updating={true}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />
    );

    // Card has is-updating class
    expect(container.querySelector(".plugin-card.is-updating")).toBeTruthy();
    // Progress animation bar and hint are rendered
    expect(container.querySelector(".plugin-update-bar")).toBeTruthy();
    expect(container.querySelector(".plugin-update-shimmer")).toBeTruthy();
    expect(screen.getByText("正在下载并安装新版本…")).toBeTruthy();
    // Button shows updating text and spinning icon
    expect(screen.getByText("更新中…")).toBeTruthy();
    // Accessible name remains findable
    expect(screen.getByRole("button", { name: "更新插件" })).toBeTruthy();
  });

  it("shows animated progress and installing state when installing a new plugin", () => {
    const { container } = render(
      <PluginCard
        entry={entry}
        mode="market"
        disabled={true}
        ready={true}
        updating={true}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />
    );

    expect(container.querySelector(".plugin-card.is-updating")).toBeTruthy();
    expect(container.querySelector(".plugin-update-bar")).toBeTruthy();
    expect(screen.getByText("正在下载并安装插件…")).toBeTruthy();
    expect(screen.getByText("安装中…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "安装插件" })).toBeTruthy();
  });
});
