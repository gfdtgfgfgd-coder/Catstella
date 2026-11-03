const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('🧪 开始测试 Gemini-Web-Companion 时区智能推断与修正...');

// 模拟浏览器环境
const code = fs.readFileSync(path.join(__dirname, '../content/tracker.js'), 'utf8');

// 提取 KiminoTracker 类定义
const ctx = {
  window: {
    addEventListener: () => {},
    location: { pathname: '/app/test-chat', href: 'https://gemini.google.com/app/test-chat' },
    postMessage: () => {}
  },
  document: {
    readyState: 'complete',
    addEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => null
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  NodeFilter: {
    SHOW_TEXT: 4,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2,
    FILTER_SKIP: 3
  },
  setInterval: () => 1,
  setTimeout: () => 1,
  clearTimeout: () => {},
  console: console
};
ctx.window.KIMINO_API = {
  storageGet: async () => ({}),
  storageSet: async () => {}
};

const context = vm.createContext(ctx);
vm.runInContext(code, context);
const tracker = context.window.__KIMINO_TRACKER__;

assert.ok(tracker, 'Tracker 实例应成功创建');

// 场景 1: 用户在东八区 (UTC+8)，当前时间为 2026-11-03 16:35:00
// Google 返回 "用量限额将于 11月3日09:37 重置"
console.log('测试 1: 绝对日期 "用量限额将于 11月3日09:37 重置" (UTC 09:37 -> 本地 17:37)');
const r1 = tracker.parseResetHint('用量限额将于 11月3日09:37 重置；在此之前，部分功能将无法使用。 查看用量 升级');
assert.ok(r1, '应成功匹配额度提示');
assert.strictEqual(r1.limited, false);
assert.strictEqual(r1.rawDisplay, '11月3日09:37');
console.log('   -> 解析结果:', r1.display, 'epoch:', r1.resetAt?.toISOString(), 'isUtcCorrected:', r1.isUtcCorrected);
assert.ok(r1.resetAt && typeof r1.resetAt.getTime === 'function', 'resetAt 应为 Date');
// 在本地时区下，小时数应转换
const expectedLocalH = new Date(Date.UTC(new Date().getFullYear(), 10, 3, 9, 37)).getHours();
assert.strictEqual(r1.resetAt.getHours(), expectedLocalH, `本地小时应为 ${expectedLocalH}`);

// 场景 2: 用户在东八区，Google 输入框上方提示条返回 "用量限额将在9:37 上午 重置"
console.log('测试 2: 绝对时刻 "用量限额将在9:37 上午 重置"');
const r2 = tracker.parseResetHint('用量限额将在9:37 上午 重置  查看用量  升级');
assert.ok(r2, '应成功匹配时刻提示');
assert.strictEqual(r2.rawDisplay, '9:37 上午');
console.log('   -> 解析结果:', r2.display, 'epoch:', r2.resetAt?.toISOString(), 'isUtcCorrected:', r2.isUtcCorrected);

// 场景 3: 相对时间 "2小时30分钟后" (不应误转 UTC)
console.log('测试 3: 相对时间 "用量限额将在 2小时30分钟后 重置"');
const r3 = tracker.parseResetHint('用量限额将在 2小时30分钟后 重置');
assert.ok(r3, '应成功匹配相对时间');
assert.strictEqual(r3.isUtcCorrected, false);
const diffMin = Math.round((r3.resetAt.getTime() - Date.now()) / 60000);
assert.ok(diffMin >= 149 && diffMin <= 151, `相对时间差应在 150 分钟左右，实际 ${diffMin}`);

// 场景 4: 限流状态识别
console.log('测试 4: "已达到上限。继续使用 Flash-Lite。用量限额将于 11月3日09:37 重置"');
const r4 = tracker.parseResetHint('已达到上限。继续使用 Flash-Lite。用量限额将于 11月3日09:37 重置');
assert.ok(r4, '应成功匹配限流提示');
assert.strictEqual(r4.limited, true, '应标记已限流');

// 场景 5: toLocalResetTime 单独调用验证
console.log('测试 5: toLocalResetTime("09:37") 与 toLocalResetTime("11月3日09:37")');
const t1 = tracker.toLocalResetTime('09:37');
assert.ok(t1 && t1.date, 'toLocalResetTime 纯时刻应解析成功');
const t2 = tracker.toLocalResetTime('11月3日09:37');
assert.ok(t2 && t2.date, 'toLocalResetTime 带日期应解析成功');

// 场景 6: 纯普通聊天内容不误判
console.log('测试 6: 门禁检查 —— 普通对话中的“重置”文本绝不误判');
const rNeg1 = tracker.parseResetHint('我想重置一下我的密码');
assert.strictEqual(rNeg1, null, '普通聊天文本不应被当成额度提示');
const rNeg2 = tracker.parseResetHint('如果我们在 9:30 上午 见面怎么样？');
assert.strictEqual(rNeg2, null, '普通约定时间不应被当成额度提示');

// 场景 7: 用户提供的真实 HTML 结构文案测试
console.log('测试 7: 用户提供的真实 Google Gemini 提示栏文案');
const rawHtml1Text = '用量限额将于 11月3日09:37 重置；在此之前，部分功能将无法使用。升级即可获享更高用量限额及更多功能。';
const r7_1 = tracker.parseResetHint(rawHtml1Text);
assert.ok(r7_1, '真实 HTML Banner 应解析成功');
assert.strictEqual(r7_1.rawDisplay, '11月3日09:37');
assert.strictEqual(r7_1.display, '11月3日 17:37');

const rawHtml2Text = '用量限额将在9:37 上午 重置 查看用量 升级';
const r7_2 = tracker.parseResetHint(rawHtml2Text);
assert.ok(r7_2, '真实 HTML 底部栏应解析成功');
assert.strictEqual(r7_2.rawDisplay, '9:37 上午');
assert.ok(r7_2.display && typeof r7_2.display === 'string', 'display 格式化字符串应存在');

// 场景 8: parseQuotaText 统一解析器测试
console.log('测试 8: parseQuotaText 双语与真实 DOM 解析');
const qCn = tracker.parseQuotaText('用量限额\n当前用量\n已使用 67%\n重置时间: 01:37\n每周限额\n已使用 64%\n重置时间: 11月3日23:37');
assert.strictEqual(qCn.currentPct, 67);
assert.strictEqual(qCn.weeklyPct, 64);
assert.strictEqual(qCn.currentReset, '01:37');

const qEn = tracker.parseQuotaText('Current usage\n67% used\nResets: 01:37\nWeekly limit\n64% used\nResets: 11月3日 23:37');
assert.strictEqual(qEn.currentPct, 67);
assert.strictEqual(qEn.weeklyPct, 64);

// 场景 9: 账本权威时间校准与页面文案旧值纠偏 (03:37 -> 02:37)
console.log('测试 9: 账本权威时间纠偏 (03:37 -> 02:37 本地时间)');
tracker.sessionData.realQuota = {
  currentResetTime: '02:37',
  fiveResetEpoch: Date.now() + 2 * 3600 * 1000,
  isReal: true,
  fetchedAt: Date.now()
};

// 模拟 DOM 文本节点与容器
class MockTextNode {
  constructor(val) { this.nodeValue = val; }
}
class MockElement {
  constructor(text) {
    this.attrs = {};
    this.childNode = new MockTextNode(text);
  }
  getAttribute(k) { return this.attrs[k] || null; }
  setAttribute(k, v) { this.attrs[k] = v; }
}

context.document.createTreeWalker = (root, filterType, options) => {
  let done = false;
  return {
    nextNode() {
      if (done) return null;
      done = true;
      const accept = options.acceptNode(root.childNode);
      return accept === 1 ? root.childNode : null;
    }
  };
};

const elStale = new MockElement('用量限额将在03:37（本地时间）重置 查看用量 升级');
elStale.setAttribute('data-kimino-tz-fixed', '03:37');

tracker.patchElementTimezoneText(elStale, {
  rawDisplay: '7:37 下午',
  display: '03:37'
});

assert.strictEqual(elStale.getAttribute('data-kimino-tz-fixed'), '02:37', '应更新为账本权威时间 02:37');
assert.ok(elStale.childNode.nodeValue.includes('02:37（本地时间）'), '文本节点应包含 02:37（本地时间）');
assert.ok(!elStale.childNode.nodeValue.includes('03:37'), '文本节点绝不应再残留 03:37');
console.log('   -> 成功纠偏:', elStale.childNode.nodeValue);

console.log('🎉 所有时区智能推断与修正单元测试通过！');
