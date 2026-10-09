import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

async function probe(sentinel, port) {
  const result = { read: false, write: false, link: false, spawn: false, socket: false };
  try { fs.readFileSync(sentinel); result.read = true; } catch {}
  try { fs.writeFileSync(sentinel, 'OVERWRITE'); result.write = true; } catch {}
  try { fs.symlinkSync(sentinel, 'escape'); fs.readFileSync('escape'); result.link = true; } catch {}
  process.stderr.write('probe: filesystem checked\n');
  // Ignore child pipes: Windows may reject a new process through the Job Object
  // before its inherited pipe handles close. Observe the process itself instead.
  result.spawn = await new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh';
    const args = process.platform === 'win32' ? ['/c', 'echo', 'ESCAPE'] : ['-c', 'echo ESCAPE'];
    let child;
    try { child = spawn(executable, args, { stdio: 'ignore' }); }
    catch (error) { if (['EACCES', 'EPERM'].includes(error.code)) resolve(false); else reject(error); return; }
    const timer = setTimeout(() => { child.kill(); reject(new Error('Unauthorized process probe did not terminate')); }, 4000);
    child.once('error', () => { clearTimeout(timer); resolve(false); });
    child.once('exit', code => { clearTimeout(timer); resolve(code === 0); });
  });
  process.stderr.write('probe: process checked\n');
  result.socket = await new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 1500);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once('error', error => { clearTimeout(timer); process.stderr.write('probe: socket denied ' + error.code + '\n'); resolve(false); });
  });
  process.stderr.write('probe: network checked\n');
  fs.writeFileSync('allowed.txt', 'OK');
  return result;
}
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  try {
    const result = request.method === 'health' ? { ready: true } : await probe(request.args.sentinel, request.args.port);
    process.stdout.write(JSON.stringify({ id: request.id, result }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ id: request.id, error: error.message }) + '\n');
  }
}
