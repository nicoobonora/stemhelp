import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import electron from 'electron';
const env = { ...process.env, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR || resolve('.local-data') };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
child.on('error', error => { console.error('Impossibile avviare Electron:', error.message); process.exit(1); });
child.on('exit', (code, signal) => {
  if (signal) console.error(`Electron si è chiuso prima del completamento (${signal}).`);
  process.exit(code ?? 1);
});
