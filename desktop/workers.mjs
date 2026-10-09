import { mkdir, mkdtemp, realpath, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { confinedPath, TARGET } from './security.mjs';
import { launchSandbox, RpcWorker, cleanupSandbox } from './sandbox.mjs';
export class Workers {
  constructor(root, launcher, nodeRuntime) { this.root = root; this.launcher = launcher; this.nodeRuntime = nodeRuntime; this.workers = new Map(); }
  async recover() {
    await mkdir(this.root,{recursive:true,mode:0o700});
    const journals = path.join(this.root,'.policies'); await mkdir(journals,{recursive:true,mode:0o700});
    for(const entry of await readdir(journals)) if(/^\.sandbox-[a-f0-9-]+\.json$/.test(entry)) { const file=path.join(journals,entry); await cleanupSandbox(this.launcher,file); await rm(file,{force:true}); }
    for(const name of await readdir(this.root)) {
      if(name === '.policies') continue;
      const dir = path.join(this.root,name);
      const info = await import('node:fs/promises').then(fs => fs.lstat(dir));
      if(info.isDirectory() && !info.isSymbolicLink()) await rm(dir,{recursive:true,force:true});
    }
  }
  async start(plugin, caller = plugin.id) {
    if (this.recoveryError) throw new Error('SANDBOX_UNAVAILABLE：任务恢复失败。' + this.recoveryError);
    const key = plugin.id + ":" + caller;
    if (!plugin.enabled || plugin.missing?.length) throw new Error('插件已停用或缺少服务依赖。');
    if (!plugin.backend) throw new Error('插件没有本地服务。');
    if (this.workers.has(key)) return this.workers.get(key);
    const pending = this.launch(plugin); this.workers.set(key, pending);
    try { const worker = await pending; worker.child.once('close', () => { if (this.workers.get(key) === pending) this.workers.delete(key); }); return worker; } catch (e) { this.workers.delete(key); throw e; }
  }
  async launch(plugin) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const cwd = await realpath(await mkdtemp(path.join(this.root, plugin.id + '-')));
    const entry = await confinedPath(plugin.folder, plugin.backend.entry[TARGET]);
    let worker;
    try {
      const node = plugin.backend.type === 'node'; const executable = node ? this.nodeRuntime : entry;
      const readOnly = [await realpath(plugin.folder)]; if (node) {
        const runtime = await realpath(this.nodeRuntime), dir = path.dirname(runtime);
        readOnly.push(runtime);
        if (process.platform === 'darwin' && dir.endsWith('/Contents/MacOS')) readOnly.push(await realpath(path.join(dir, '../Frameworks')));
        else if (process.platform === 'win32') { for (const name of await readdir(dir)) if (/\.(dll|pak|dat|bin)$/i.test(name)) readOnly.push(path.join(dir, name)); }
      }
      const child = await launchSandbox({ executable, args: node ? [entry] : [], readOnly, writable: [cwd], cwd, launcher: this.launcher, env: node ? { ELECTRON_RUN_AS_NODE: '1' } : {} });
      worker = new RpcWorker(child); worker.directory = cwd; child.once('close', () => void child.cleanup.then(() => rm(cwd, { recursive: true, force: true })));
      await worker.call('health'); return worker;
    } catch (e) { await worker?.stop(); await rm(cwd, { recursive: true, force: true }); throw e; }
  }
  async stop(id) {
    const entries = [...this.workers].filter(([key]) => key.split(':').includes(id));
    for (const [key] of entries) this.workers.delete(key);
    await Promise.all(entries.map(async ([,pending]) => (await pending.catch(() => null))?.stop()));
  }
  async stopAll() { await Promise.all([...new Set([...this.workers.keys()].map(key => key.split(':')[0]))].map(id => this.stop(id))); }
}
