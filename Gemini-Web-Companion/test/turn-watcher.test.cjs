const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('completion watcher reads content without forcing layout or treating visibility as new output', () => {
  let now = 10000;
  let poll;
  let text = 'Reply content including the collapsed portion';
  let reads = 0;
  const response = {
    get textContent() { reads++; return text; },
    get innerText() { throw new Error('rendered text access would force layout'); }
  };
  const window = {
    location: { pathname: '/app/fixture' },
    // Keep unrelated startup work pending; exercise the actual watcher below.
    KIMINO_API: { storageGet: () => new Promise(() => {}) }
  };
  const context = vm.createContext({
    window,
    document: { querySelectorAll: selector => selector === 'user-query' ? [{}] : [response] },
    Date: class extends Date { static now() { return now; } },
    console,
    setInterval: callback => { poll = callback; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../content/tracker.js'), 'utf8'), context);
  const tracker = window.__KIMINO_TRACKER__;
  const completed = [];
  tracker.refreshUsageLedger = reason => completed.push(reason);
  tracker.initTurnDomWatcher();
  poll();
  assert.equal(reads, 1);
  now += 1300;
  poll();
  assert.deepEqual(completed, ['after-turn-dom']);
  // Collapsing changes rendering/visibility, while DOM text is unchanged.
  now += 2000;
  poll();
  assert.equal(completed.length, 1);
  text += ' new streamed content';
  poll();
  assert.equal(completed.length, 1);
  now += 1300;
  poll();
  assert.equal(completed.length, 2);
});
