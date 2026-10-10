import { access, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function preparePluginMigration(userData) {
  const filename = path.join(userData, 'plugin-migration-v027.json');
  let state;
  try { state = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let legacy = false, plugins = {};
    try { await access(path.join(userData, 'harness/profiles/commerce-desktop/package.json')); legacy = true; } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
    try { plugins = JSON.parse(await readFile(path.join(userData, 'plugins/state.json'), 'utf8')).plugins ?? {}; } catch (failure) { if (failure.code !== 'ENOENT' && !(failure instanceof SyntaxError)) throw failure; }
    const previous = plugins['official.labeledit'];
    state = { pending: legacy && !previous?.removed && !previous?.folder, enabled: previous?.enabled !== false };
    await mkdir(userData, { recursive: true });
    await writeFile(filename, JSON.stringify(state), { mode: 0o600 });
  }
  return {
    async status(manager) {
      if (!state.pending || (await manager.list()).some(plugin => plugin.id === 'official.labeledit')) return null;
      return { id: 'official.labeledit', title: 'LabelEdit', enabled: state.enabled };
    },
    enabled: state.enabled,
    async dismiss() {
      state = { ...state, pending: false };
      await writeFile(filename + '.tmp', JSON.stringify(state), { mode: 0o600 });
      await rename(filename + '.tmp', filename);
    },
  };
}
