import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mods = ['agent-radar', 'spaces-agents', 'picker-plus', 'jira'];
const fileOf = (mod, name) => path.join(root, mod, 'mods', mod, name);

// Load the real module graph, substituting only APIs supplied by Herdr's host.
// Native rendering is verified separately with herdr-app check and screenshots.
async function load(mod, name, overrides = {}) {
  const context = vm.createContext({ console, Date, Set, Map, Promise });
  const calls = [];
  const state = new Map();
  const element = new Proxy(function () {}, {
    get(_target, key) {
      if (key === 'then') return undefined;
      if (key === 'value') return () => '';
      return () => element;
    },
    apply() { return element; },
    construct() { return element; },
  });
  const host = {
    checking: () => true,
    window: () => ({ platform: 'windows', active: true }),
    appHome: () => root,
    home: () => root,
    props: () => ({ overlay: 'test-window' }),
    placement: () => null,
    focused: () => ({}),
    agents: () => [], spaces: () => [], panes: () => [], terminals: () => [], machines: () => [],
    fonts: () => [], settings: () => ({ zoom: 1, sounds: { enabled: false } }),
    layout: () => ({}), theme: () => new Proxy({}, { get: () => '#111111' }),
    shared: (key) => state.get(key), setShared: (key, value) => state.set(key, value),
    exec: async (...args) => { calls.push(['exec', ...args]); return { code: 0, stdout: '{}', stderr: '' }; },
    hc: async (...args) => { calls.push(['hc', ...args]); return { code: 0, stdout: '{}', stderr: '' }; },
    readTextFile: async () => null,
    writeTextFile: async (...args) => { calls.push(['write', ...args]); },
    closeOverlay: (...args) => calls.push(['close', ...args]),
    run: (...args) => calls.push(['run', ...args]),
    watchFolder: async () => {},
    ...overrides,
  };
  const sources = new Map();
  const names = new Map();
  for (const modName of mods) {
    const folder = path.dirname(fileOf(modName, 'main.js'));
    for (const entry of await fs.readdir(folder, { recursive: true })) {
      if (!entry.endsWith('.js')) continue;
      const source = await fs.readFile(path.join(folder, entry), 'utf8');
      sources.set(path.join(folder, entry), source);
      for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
        const exports = names.get(match[2]) ?? new Set();
        match[1].split(',').forEach((one) => exports.add(one.trim().split(/\s+as\s+/)[0]));
        names.set(match[2], exports);
      }
    }
  }
  const modules = new Map();
  const synthetic = (id, exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    Object.entries(exports).forEach(([key, value]) => this.setExport(key, value));
  }, { context, identifier: id });
  function get(id) {
    if (modules.has(id)) return modules.get(id);
    let module;
    if (id === 'fs/promises') {
      module = synthetic(id, { ...fs, exists: async (name) => fs.access(name).then(() => true, () => false), ...overrides.fs });
    } else if (id === 'herdr') {
      module = synthetic(id, Object.fromEntries([...names.get(id)].map((key) => [key, host[key] ?? (() => {})])));
    } else if (id === 'gpui-kit' || id === 'gpui-base') {
      module = synthetic(id, Object.fromEntries([...names.get(id)].map((key) => [key, key === 'View' ? class View {} : element])));
    } else {
      const source = sources.get(id);
      if (!source) throw new Error(`Unexpected import: ${id}`);
      module = new vm.SourceTextModule(source, { context, identifier: id });
    }
    modules.set(id, module);
    return module;
  }
  const entry = get(fileOf(mod, name));
  await entry.link((specifier, parent) => get(specifier.startsWith('.') ? path.resolve(path.dirname(parent.identifier), specifier) : specifier));
  await entry.evaluate();
  return { exports: entry.namespace, calls, element };
}

for (const mod of mods) {
  test(`${mod}: check initializes and renders without process/file-write tasks`, async () => {
    const { exports, calls, element } = await load(mod, 'main.js');
    const spawned = [];
    const cx = { focus_handle: () => element, timer: { after() {}, every() {} }, spawn: (fn) => spawned.push(fn), notify() {} };
    const view = new exports.default();
    view.init({}, cx);
    view.render(cx);
    assert.deepEqual(calls.filter(([kind]) => ['exec', 'hc', 'write'].includes(kind)), []);
    assert.equal(spawned.length, 0);
  });
}

for (const mod of ['agent-radar', 'spaces-agents']) {
  test(`${mod}: recognizes Windows and Unix Claude executable paths`, async () => {
    for (const executable of ['C:\\Program Files\\Claude\\claude.exe', '/usr/local/bin/claude']) {
      const pane = { terminal: 't1', cwd: root };
      const { exports } = await load(mod, 'claude.js', {
        panes: () => [pane],
        hc: async () => ({ code: 0, stdout: JSON.stringify({ foreground: { argv: [executable], pid: 123 } }) }),
      });
      const watcher = new (exports.ClaudeWatch ?? exports.ClaudeSessions)();
      await watcher.queryForeground([pane]);
      assert.equal(watcher.fg.t1.claude, true);
    }
  });
}

test('Jira: URL launcher selects Windows, macOS and Linux commands without a shell', async () => {
  const url = "https://example.invalid/browse/ABC-1?x=a&y=o'neil";
  for (const [platform, expected] of [['windows', ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]], ['macos', ['open', [url]]], ['linux', ['xdg-open', [url]]]]) {
    const { exports, calls } = await load('jira', 'acli.js', { window: () => ({ platform }) });
    await exports.openUrl(url);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['exec', ...expected]);
    await assert.rejects(exports.openUrl('file:///private'), /HTTP/);
    assert.equal(calls.length, 1);
  }
});

test('Jira: missing Team fails before shared state or a window is changed', async () => {
  const { exports, calls } = await load('jira', 'devlink.js', { fs: { exists: async () => false } });
  await assert.rejects(exports.startDev({ key: 'ABC-1' }), /Team mod/);
  assert.deepEqual(calls, []);
});

for (const mod of ['agent-radar', 'picker-plus']) {
  test(`${mod}: close action addresses its own overlay instance`, async () => {
    const { exports, calls } = await load(mod, 'main.js');
    const view = new exports.default();
    view.close();
    assert.deepEqual(calls, [['close', 'test-window']]);
  });
}

test('spaces-agents: registry accepts CRLF output and preserves live sessions', async () => {
  const { exports } = await load('spaces-agents', 'registry.js', {
    exec: async () => ({ code: 0, stdout: 'pid 123\r\nfile C:\\a b\\session.jsonl\r\n', stderr: '' }),
  });
  const registry = new exports.Registry();
  registry.sessions = { session: { pid: 123, transcript: 'C:\\a b\\session.jsonl', lastSeen: Date.now() } };
  const jobs = [];
  registry.check({ spawn: (fn) => jobs.push(fn), notify() {} });
  await jobs[0]({ notify() {} });
  assert.equal(registry.alive.has(123), true);
  assert.equal(registry.files.has('C:\\a b\\session.jsonl'), true);
  assert.equal(registry.error, null);
});

test('spaces-agents: macOS registry keeps its Unix command', async () => {
  const { exports, calls } = await load('spaces-agents', 'registry.js', { window: () => ({ platform: 'macos' }) });
  const registry = new exports.Registry();
  registry.sessions = { session: { pid: 123, transcript: '/tmp/example', lastSeen: Date.now() } };
  const jobs = [];
  registry.check({ spawn: (fn) => jobs.push(fn), notify() {} });
  await jobs[0]({ notify() {} });
  assert.equal(calls[0][1], 'sh');
});

test('spaces-agents: Windows basename handles backslashes and trailing separators', async () => {
  const { exports } = await load('spaces-agents', 'util.js');
  assert.equal(exports.base('C:\\Users\\someone\\my project\\'), 'my project');
  assert.equal(exports.base('/home/someone/my project/'), 'my project');
});

test('Picker: filtering and selection open Jira and switch existing tabs', async () => {
  const { exports, calls, element } = await load('picker-plus', 'main.js');
  const picker = new exports.default();
  const cx = { focus_handle: () => element, timer: { after() {}, every() {} }, notify() {} };
  picker.init({}, cx);
  picker.filter = 'jira';
  const row = picker.rows().find((one) => one.kind === 'mod');
  assert.equal(row.mod, 'jira');
  picker.go(row, cx);
  picker.go({ kind: 'ctx', ctx: { id: 'existing-tab' } }, cx);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['close', 'test-window'], ['run', 'mod.open', { name: 'jira' }],
    ['close', 'test-window'], ['run', 'tab.select', { id: 'existing-tab' }],
  ]);
});

test('Jira: a transition sends no command until the user confirms', async () => {
  const { exports, calls } = await load('jira', 'actions.js', {
    exec: async (program, argv) => {
      calls.push(['exec', program, ...argv]);
      return { code: 0, stdout: '{}', stderr: '' };
    },
  });
  const jobs = [];
  const cx = { notify() {}, spawn: (fn) => jobs.push(fn) };
  const app = {
    state: { rows: [{ key: 'TEST-1', status: 'To Do' }], drawer: { key: 'TEST-1' } },
    set(patch) { this.state = { ...this.state, ...patch }; },
    blur() {}, load() {},
  };
  exports.pickStatus(app, 'In Progress', cx);
  assert.equal(app.state.action.stage, 'confirm');
  assert.deepEqual(calls, []);
  exports.cancelAction(app, cx);
  assert.equal(app.state.action, null);
  assert.deepEqual(calls, []);
  exports.pickStatus(app, 'In Progress', cx);
  exports.confirmAction(app, cx);
  assert.deepEqual(calls, []);
  await jobs.shift()(cx);
  assert.deepEqual(calls[0], ['exec', 'acli', 'jira', 'workitem', 'transition', '--key', 'TEST-1', '--status', 'In Progress', '--yes']);
});
