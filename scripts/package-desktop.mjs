import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { desktopSigningMode, packagingOptions, packagingEnvironment } from '../desktop/distribution.mjs';

const mode = desktopSigningMode();
const distribution = JSON.parse(await readFile('resources/generated/distribution.json', 'utf8'));
if (distribution.signing !== mode) throw new Error('打包模式与应用更新配置不一致，请重新运行 platform:prepare。');
const command = process.execPath;
const args = ['node_modules/electron-builder/cli.js', ...packagingOptions(mode, process.platform, process.argv.includes('--dir'))];
// osx-sign scans the unpacked dependency tree concurrently. macOS CI starts
// with a low soft descriptor limit; raise it only in the builder child process.
// All paths/arguments are passed as positional parameters, never shell code.
const result = process.platform === 'darwin'
  ? spawnSync('/bin/sh', ['-c', 'qingzuo_file_limit=$(ulimit -S -n)\nif [ "$qingzuo_file_limit" != unlimited ] && [ "$qingzuo_file_limit" -lt 65536 ]; then ulimit -S -n 65536 || exit; fi\nexec "$@"', 'qingzuo-packager', command, ...args], { stdio: 'inherit', env: packagingEnvironment(mode) })
  : spawnSync(command, args, { stdio: 'inherit', env: packagingEnvironment(mode) });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
