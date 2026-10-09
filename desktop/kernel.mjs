import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runProfile } from '@deepseek-ai/dsh/profile-boot';
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
export async function bootCommerceKernel({ home, installAnchor, invoke = async () => null }) {
  const dir = path.join(home, 'profiles', 'commerce-desktop'); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'commerce-desktop-profile', private: true, dsh: { profile: { bundles: ['@commerce/platform-bundle'] } } }));
  await writeFile(path.join(dir, 'cordis.patch.yml'), '[]\n');
  const systems = new Map(), tools = new Map(), adapters = new Map();
  // The bridge is a trusted configuration row, not user-supplied code.
  const bridgeFile = path.join(dir, 'bridge.mjs');
  await writeFile(bridgeFile, "export function apply(ctx) { ctx.provide('commerceBridge', globalThis.__commerceBridge); }\n");
  globalThis.__commerceBridge = { invoke, registerSystem(service) { systems.set(service.id, service); return () => systems.delete(service.id); } };
  await writeFile(path.join(dir, 'cordis.patch.yml'), '- insert:\n    - id: commerce-bridge\n      name: ' + JSON.stringify(bridgeFile) + '\n');
  const loaded = loadProfileDirectory('commerce-desktop', dir, installAnchor);
  const runtime = await runProfile({ environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]), profile: 'commerce-desktop', resolvedProfile: { profile: loaded, installAnchor }, args: [], patchFiles: [] });
  if (systems.size !== 7) { await runtime.ctx.fiber.dispose(); throw new Error('平台系统插件未能全部加载。'); }
  async function reconcile(plugins) {
    // Descriptors only. Third-party JS never enters this process.
    for (const fiber of adapters.values()) await fiber.dispose();
    adapters.clear(); tools.clear();
    for (const plugin of plugins.filter(p => p.enabled && !p.missing?.length)) {
      const fiber = runtime.ctx.plugin({ name: 'commerce-tool-' + plugin.id, apply(child) {
        child.effect(() => {
          for (const service of plugin.services?.provides ?? []) {
            if (tools.has(service)) throw new Error('重复服务：' + service);
            tools.set(service, { plugin: plugin.id, invoke: (method, args, caller) => invoke('tool', 'call', { provider: plugin.id, service, method, args, caller }) });
          }
          return () => { for (const service of plugin.services?.provides ?? []) tools.delete(service); };
        });
      }});
      adapters.set(plugin.id, fiber);
    }
    return [...tools.keys()];
  }
  async function call(kind, service, method, args = {}, caller) {
    if (kind === 'system') { const entry = systems.get(service); if (!entry) throw new Error('系统服务不可用。'); return entry.invoke(method, args); }
    const entry = tools.get(service); const fiber = adapters.get(caller);
    if (!entry || !fiber) throw new Error('工具服务不可用。');
    return entry.invoke(method, args, caller);
  }
  return { ...runtime, systems, tools, reconcile, call, dispose: async () => { await runtime.ctx.fiber.dispose(); delete globalThis.__commerceBridge; } };
}
