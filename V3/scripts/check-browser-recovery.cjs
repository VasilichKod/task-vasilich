const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app-v3.js'), 'utf8');
const start = source.indexOf('function loadWorkspaceCacheForCurrentUser()');
const end = source.indexOf('\nfunction authFetch', start);
const values = new Map();
let key = 'workspace:user:one';
let applied;
const context = vm.createContext({
  JSON, Date, console,
  _hasPersistedLocalWorkspace: false,
  getWorkspaceStorageKey: () => key,
  localStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
  applyLocalWorkspaceSnapshot: raw => { applied = raw; },
});
vm.runInContext(source.slice(start, end), context);
const recent = { data: { w20261102: { project: { 0: [{ id: 'recent', text: 'Current task' }] } } } };
values.set(key, JSON.stringify(recent));
assert.equal(context.loadWorkspaceCacheForCurrentUser(), true);
assert.deepEqual(applied, recent);
const saved = JSON.parse(values.get(`${key}:before-firstbyte-2026-11-05`));
assert.deepEqual(saved.snapshot, recent);
values.set(key, JSON.stringify({ data: {} }));
context.loadWorkspaceCacheForCurrentUser();
assert.deepEqual(JSON.parse(values.get(`${key}:before-firstbyte-2026-11-05`)).snapshot, recent);
key = 'workspace:user:two';
assert.equal(context.loadWorkspaceCacheForCurrentUser(), false);
assert.equal(values.has(`${key}:before-firstbyte-2026-11-05`), false);
key = null;
assert.equal(context.loadWorkspaceCacheForCurrentUser(), false);
console.log('Browser recovery passed: preserved original cache, no overwrite, workspace separation.');
