import filesystem from 'node:fs';
import { createRequire } from 'node:module';

let raw = filesystem;
try { raw = createRequire(import.meta.url)('original-fs'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

export const { createReadStream } = raw;
export const { access, chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, stat, symlink, writeFile } = raw.promises;
