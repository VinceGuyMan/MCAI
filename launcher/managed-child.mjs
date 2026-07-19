import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

function readArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0 || separator === argv.length - 1) throw new Error('managed child requires -- <command> [args]');
  const options = {};
  for (let index = 0; index < separator; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    options[key] = argv[index + 1];
  }
  return { options, command: argv[separator + 1], args: argv.slice(separator + 2) };
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* rename reports the real failure */ }
  fs.renameSync(tempPath, filePath);
}

function removeOwnedState(filePath, nonce) {
  try {
    const current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (current.nonce === nonce) fs.unlinkSync(filePath);
  } catch {
    // State may already be gone after a launcher cleanup.
  }
}

const { options, command, args } = readArgs(process.argv.slice(2));
const role = String(options.role || 'process');
const statePath = path.resolve(String(options.state || ''));
const cwd = path.resolve(String(options.cwd || process.cwd()));
const nonce = String(options.nonce || '');
if (!statePath || !nonce) throw new Error('managed child requires --state and --nonce');

const child = spawn(command, args, {
  cwd,
  shell: false,
  windowsHide: false,
  stdio: role === 'server' ? ['pipe', 'inherit', 'inherit'] : ['ignore', 'inherit', 'inherit']
});

let stopping = false;
let childExited = false;
const control = http.createServer((request, response) => {
  const reject = (status, message) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(`${JSON.stringify({ ok: false, message })}\n`);
  };
  if (request.method !== 'POST' || request.url !== '/control') return reject(404, 'not found');
  if (request.headers['x-mcai-nonce'] !== nonce) return reject(403, 'invalid nonce');

  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size <= 2048) chunks.push(chunk);
  });
  request.on('end', () => {
    if (size > 2048) return reject(413, 'request too large');
    let payload = {};
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return reject(400, 'invalid json'); }
    if (payload.action === 'status') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ ok: true, role, childPid: child.pid, stopping })}\n`);
      return;
    }
    if (payload.action !== 'stop') return reject(400, 'unsupported action');
    if (!stopping) {
      stopping = true;
      if (role === 'server' && child.stdin?.writable) child.stdin.write('stop\n');
      else child.kill('SIGTERM');
    }
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(`${JSON.stringify({ ok: true, accepted: true, role, childPid: child.pid })}\n`);
  });
});

control.listen(0, '127.0.0.1', () => {
  if (childExited || !child.pid) {
    control.close();
    return;
  }
  const address = control.address();
  writeJsonAtomic(statePath, {
    schemaVersion: 1,
    role,
    root: cwd,
    nonce,
    supervisorPid: process.pid,
    childPid: child.pid,
    controlHost: '127.0.0.1',
    controlPort: address.port,
    command: path.resolve(command),
    startedAt: new Date().toISOString()
  });
  console.log(`[MCAI] managed ${role} started (PID ${child.pid}).`);
});

child.on('error', (error) => {
  childExited = true;
  console.error(`[MCAI] failed to start managed ${role}: ${error.message}`);
  removeOwnedState(statePath, nonce);
  control.close();
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  childExited = true;
  console.log(`[MCAI] managed ${role} exited (code=${code ?? 'none'}, signal=${signal || 'none'}).`);
  removeOwnedState(statePath, nonce);
  control.close();
  process.exitCode = Number.isInteger(code) ? code : 0;
});

function forwardShutdown() {
  if (stopping) return;
  stopping = true;
  if (role === 'server' && child.stdin?.writable) child.stdin.write('stop\n');
  else child.kill('SIGTERM');
}

process.on('SIGINT', forwardShutdown);
process.on('SIGTERM', forwardShutdown);
