const { createRequire } = require('node:module');
const marker = Symbol.for('qingzuo.build.boundedBinaryScan');

// Bound the upstream detector, retaining its binary classification and the
// upstream traversal/signing rules. This hook only runs inside electron-builder.
function limitBinaryScan(detector, concurrency = 32) {
  if (detector.isBinaryFile[marker]) return;
  const original = detector.isBinaryFile, waiting = []; let active = 0;
  async function bounded(...args) {
    if (active >= concurrency) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try { return await original(...args); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
  bounded[marker] = true; detector.isBinaryFile = bounded;
}

function limitMacBinaryScan() {
  // Resolve the exact detector instance used by osx-sign, including its nested
  // dependency version. A toolchain upgrade must review this build-only hook.
  const entry = require.resolve('@electron/osx-sign');
  const scoped = createRequire(entry);
  const pkg = scoped('../../package.json');
  if (pkg.version !== '1.3.3') throw new Error('macOS 签名工具版本变化，请复核文件扫描并发限制。');
  limitBinaryScan(scoped('isbinaryfile'));
}
module.exports = { limitMacBinaryScan, limitBinaryScan };
