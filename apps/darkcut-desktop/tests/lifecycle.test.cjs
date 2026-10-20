const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual desktop entrypoint with OS/Electron boundaries replaced.
function harness({ hasLock = true, killStatus = 0, platform = 'win32' } = {}) {
  const children = [], kills = [], writes = [], handlers = new Map();
  const app = Object.assign(new EventEmitter(), {
    commandLine: { appendSwitch() {} }, getPath: () => '/profile',
    getVersion: () => 'test', requestSingleInstanceLock: () => hasLock,
    quit() {}, whenReady: () => new Promise(() => {}),
  });
  const mocks = {
    electron: { app, ipcMain: { handle: (name, fn) => handlers.set(name, fn) } },
    'node:fs': { mkdirSync() {}, writeFileSync: (...args) => writes.push(args),
      appendFileSync() {}, existsSync: () => true },
    'node:child_process': {
      spawn() {
        const child = Object.assign(new EventEmitter(), {
          pid: 100 + children.length, exitCode: null, killed: false,
          kill() { this.killed = true; }, stdout: new EventEmitter(), stderr: new EventEmitter(),
        });
        children.push(child); return child;
      },
      spawnSync: (...args) => { kills.push(args); return { status: killStatus }; },
    },
  };
  const context = vm.createContext({ require: name => mocks[name] || require(name),
    __dirname: path.resolve(__dirname, '..'),
    process: { argv: [], env: {}, platform, on() {} },
    setTimeout, console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8') +
    '\nthis.api = { startMinerExe, stopServer, stopChildTree, getMiner: () => darkMinerProcess };', context);
  return { ...context.api, children, kills, writes };
}

test('failed asynchronous launch returns failure and permits a retry', async () => {
  const h = harness();
  const pending = h.startMinerExe('/miner.exe');
  h.children[0].emit('error', new Error('EACCES'));
  const result = await pending;
  assert.equal(result.ok, false); assert.match(result.error, /EACCES/);
  const retry = h.startMinerExe('/miner.exe');
  h.children[1].emit('spawn');
  assert.equal((await retry).ok, true);
});

test('concurrent starts share one launch and wait for the spawn event', async () => {
  const h = harness(); let settled = false;
  const first = h.startMinerExe('/miner.exe').then(r => { settled = true; return r; });
  const second = h.startMinerExe('/miner.exe');
  await Promise.resolve();
  assert.equal(settled, false); assert.equal(h.children.length, 1);
  h.children[0].emit('spawn');
  assert.equal((await first).ok, true); assert.equal((await second).ok, true);
  assert.equal((await h.startMinerExe('/miner.exe')).alreadyRunning, true);
});

test('late exit from failed launch does not discard the replacement', async () => {
  const h = harness(); const first = h.startMinerExe('/miner.exe');
  h.children[0].emit('error', new Error('failure')); await first;
  const second = h.startMinerExe('/miner.exe'); h.children[1].emit('spawn'); await second;
  h.children[0].emit('exit', 1);
  assert.equal(h.getMiner(), h.children[1]);
});

test('Windows shutdown kills the owned process tree once and blocks restarts', async () => {
  const h = harness(); const start = h.startMinerExe('/miner.exe');
  h.children[0].emit('spawn'); await start;
  h.stopServer(); h.stopServer();
  assert.equal(h.kills.length, 1);
  assert.equal(h.kills[0][0], 'taskkill');
  assert.deepEqual(Array.from(h.kills[0][1]), ['/PID', '100', '/T', '/F']);
  assert.equal((await h.startMinerExe('/miner.exe')).ok, false);
});

test('failed tree cleanup falls back to parent kill', async () => {
  const h = harness({ killStatus: 1 }); const start = h.startMinerExe('/miner.exe');
  h.children[0].emit('spawn'); await start; h.stopServer();
  assert.equal(h.children[0].killed, true);
});

test('second application instance preserves the running instance log', () => {
  assert.equal(harness({ hasLock: false }).writes.length, 0);
  assert.equal(harness().writes.length, 1);
});

test('non-Windows cleanup uses child kill without taskkill', async () => {
  const h = harness({ platform: 'linux' }); const start = h.startMinerExe('/miner.exe');
  h.children[0].emit('spawn'); await start; h.stopServer();
  assert.equal(h.kills.length, 0); assert.equal(h.children[0].killed, true);
});
