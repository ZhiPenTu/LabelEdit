import { spawn } from 'node:child_process';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { stdio: 'inherit' });
let desktop;
for (let i = 0; i < 80; i++) { try { await fetch('http://127.0.0.1:5188'); break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } }
const { default: electron } = await import('electron');
desktop = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, COMMERCE_DEV_URL: 'http://127.0.0.1:5188' } });
const stop = () => { desktop?.kill(); vite.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop); desktop.on('exit', () => { vite.kill(); });
