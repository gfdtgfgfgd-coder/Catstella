// 星语喵伴 · Quota & Token Sniffer (支持 Google 原生用量限额双周期同步)
// v1.2.1 变更：
//  1. 接入 KIMINO_API 兼容垫片，杜绝 Firefox 上未捕获的 Promise rejection；
//  2. 新增“输入框上方常驻提示条”实时嗅探 (方案 A)：
//     直接解析 “用量限额将在 6:37 下午 重置  查看用量  升级” 等原生文案，
//     无需用户手动打开用量弹窗即可动态更新重置时间与限流状态；
//  3. MutationObserver 回调全面节流 + 廉价扫描，消除高频 innerText 布局抖动。
(() => {
  class KiminoTracker {
    constructor() {
      this.listeners = new Set();
      this.currentChatId = this.extractChatId();
      this.config = {
        argonMaxSafeTurns: 12,
        argonMaxSafeTokens: 35000
      };

      this.sessionData = {
        chatId: this.currentChatId,
        turns: 0,
        userPromptChars: 0,
        modelOutputChars: 0,
        thinkingChars: 0,
        promptTokensEst: 0,
        outputTokensEst: 0,
        thinkingTokensEst: 0,
        totalTokensEst: 0,
        fatiguePercent: 0,
        status: 'idle',
        rateLimited: false,
        resetTimestamp: null,
        resetCountdownText: '',
        lastActiveTime: Date.now(),
        // 真实 Google 官方用量限额 (5小时当前用量 + 每周限额)
        realQuota: {
          currentUsagePercent: null, // 例如 67%
          currentResetTime: '',      // 例如 "01:37" 或 "6:37 下午"
          weeklyUsagePercent: null,  // 例如 64%
          weeklyResetTime: '',       // 例如 "11月3日23:37"
          fetchedAt: null,
          resetSource: '',           // 'hint-bar' | 'native-dialog'
          isReal: false
        }
      };

      // 嗅探节流与去重状态
      this._lastHintScan = 0;
      this._lastHintSignature = '';
      this._lastDialogScan = 0;
      this._lastMetricsScan = 0;
      this._scrapeTimer = null;
      this._lastReplayAt = 0;
      this._loggedRawOnce = false;

      this.init();
    }

    async init() {
      const api = window.KIMINO_API;
      try {
        const cfg = await api.storageGet(['argonMaxSafeTurns', 'argonMaxSafeTokens', 'cachedRealQuota']);
        if (cfg.argonMaxSafeTurns) this.config.argonMaxSafeTurns = cfg.argonMaxSafeTurns;
        if (cfg.argonMaxSafeTokens) this.config.argonMaxSafeTokens = cfg.argonMaxSafeTokens;
        if (cfg.cachedRealQuota && Date.now() - cfg.cachedRealQuota.fetchedAt < 1000 * 60 * 60 * 4) {
          this.sessionData.realQuota = { ...this.sessionData.realQuota, ...cfg.cachedRealQuota };
          this.notify();
        }
      } catch (e) { /* 缓存读取失败不影响实时嗅探 */ }

      this.initNetworkListener();
      this.initDomObserver();
      this.initUrlListener();
      this.startCountdownTimer();
      this.startQuotaRpcRefreshLoop();
      // 启动后先立刻嗅探一轮，避免冷启动空白
      setTimeout(() => { this.scheduleScrape(true); }, 800);
    }

    extractChatId() {
      const match = window.location.pathname.match(/\/app\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : 'default';
    }

    subscribe(callback) {
      this.listeners.add(callback);
      callback(this.sessionData);
      return () => this.listeners.delete(callback);
    }

    notify() {
      this.calculateMetrics();
      for (const cb of this.listeners) {
        try { cb(this.sessionData); } catch (e) {}
      }
    }

    calculateMetrics() {
      this.sessionData.promptTokensEst = Math.round(this.sessionData.userPromptChars * 0.7);
      this.sessionData.outputTokensEst = Math.round(this.sessionData.modelOutputChars * 0.7);
      this.sessionData.thinkingTokensEst = Math.round(this.sessionData.thinkingChars * 0.7);
      this.sessionData.totalTokensEst = this.sessionData.promptTokensEst + this.sessionData.outputTokensEst + this.sessionData.thinkingTokensEst;

      // 额度显示语义（v1.3.7）：官方 MaZiqc 数据权威，但 5h 窗口初期官方恒为 0%
      // （四舍五入滞后），会话估算更能实时反映消耗 —— 取两者较大值驱动用量条，
      // 并记录 displaySource 供挂件标注来源；官方重置时间始终照常显示。
      const official = this.sessionData.realQuota.currentUsagePercent;
      const turnRatio = this.sessionData.turns / Math.max(1, this.config.argonMaxSafeTurns);
      const tokenRatio = this.sessionData.totalTokensEst / Math.max(1, this.config.argonMaxSafeTokens);
      const estimate = Math.min(99, Math.round(Math.max(turnRatio, tokenRatio) * 100));
      if (typeof official === 'number') {
        this.sessionData.fatiguePercent = this.sessionData.turns > 0
          ? Math.max(official, estimate)
          : official;
        this.sessionData.realQuota.displaySource = estimate > official && this.sessionData.turns > 0 ? 'session' : 'official';
      } else {
        this.sessionData.fatiguePercent = estimate;
        this.sessionData.realQuota.displaySource = 'estimate';
      }

      if (this.sessionData.rateLimited || this.sessionData.fatiguePercent >= 100) {
        this.sessionData.status = 'rate_limited';
      } else if (this.sessionData.fatiguePercent >= 80) {
        this.sessionData.status = 'exhausted';
      } else if (this.sessionData.fatiguePercent >= 50) {
        this.sessionData.status = 'warning';
      } else if (this.sessionData.status !== 'thinking') {
        this.sessionData.status = 'idle';
      }
    }

    initNetworkListener() {
      window.addEventListener('message', (event) => {
        try {
          if (event.data?.source !== 'KIMINO_INTERCEPTOR') return;
          const { type, data } = event.data;

          if (type === 'STREAM_START') {
            this.sessionData.status = 'thinking';
            this.sessionData.lastActiveTime = Date.now();
            this.notify();
          } else if (type === 'STREAM_COMPLETE') {
            this.sessionData.status = 'idle';
            this.sessionData.lastActiveTime = Date.now();
            this.scheduleScrape(true);
            // 每轮对话结束后请求一次静默额度重放（interceptor 内部有节流）
            this.requestQuotaRpcRefresh('after-turn');
          } else if (type === 'RATE_LIMIT_HIT') {
            this.triggerRateLimit('网络返回 429 配额用尽');
          } else if (type === 'QUOTA_SNIFFED') {
            this.updateRealQuota(data);
          } else if (type === 'QUOTA_RPC_RAW') {
            this.handleQuotaRpcRaw(data);
          }
        } catch (e) {}
      });
    }

    // ============ MaZiqc RPC 数据管线（零 UI 实时额度） ============
    // interceptor.js (MAIN world, document_start) 在每次应用启动时被动捕获
    // MaZiqc（官方双周期额度 RPC），并可按需静默重放 —— 无需打开任何界面。
    handleQuotaRpcRaw(data = {}) {
      try {
        if (data.error) {
          console.warn('[星语喵伴] 额度RPC重放失败:', data.error, '(将依赖 DOM 嗅探兜底)');
          return;
        }
        const text = data.responseText || '';
        if (!text) return;
        const parsed = this.parseMaZiqcResponse(text);
        if (!parsed) {
          if (!this._loggedRawOnce) {
            this._loggedRawOnce = true;
            console.log('[星语喵伴] MaZiqc 原始负载（供解析器调优）:', text.slice(0, 2000));
          }
          return;
        }
        if (this._lastQuotaSource !== 'rpc') this._loggedRawOnce = true;
        this._lastQuotaSource = 'rpc';
        this.updateRealQuota({
          currentUsagePercent: parsed.currentPct !== null ? parsed.currentPct : this.sessionData.realQuota.currentUsagePercent,
          currentResetTime: parsed.currentReset || this.sessionData.realQuota.currentResetTime,
          weeklyUsagePercent: parsed.weeklyPct !== null ? parsed.weeklyPct : this.sessionData.realQuota.weeklyUsagePercent,
          weeklyResetTime: parsed.weeklyReset || this.sessionData.realQuota.weeklyResetTime,
          resetSource: 'rpc-' + (data.source || 'boot'),
          isReal: true
        });
        // 把官方重置时间换算成本地 epoch（当前周期驱动倒计时；每周仅记录）
        try {
          if (parsed.currentReset) {
            const ts = this.resetTextToEpoch(parsed.currentReset);
            if (ts) this.sessionData.resetTimestamp = ts;
          }
        } catch (e) {}
      } catch (e) {}
    }

    // "06:37" / "6:37 下午" / "11月3日23:37" → 本地 epoch（过期自动顺延）
    resetTextToEpoch(s) {
      if (!s) return null;
      const text = String(s).trim();
      const dateMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*([01]?\d|2[0-3])\s*[:：]\s*(\d{1,2})/);
      if (dateMatch) {
        return this.buildDate({
          month: parseInt(dateMatch[1], 10),
          day: parseInt(dateMatch[2], 10),
          hour: parseInt(dateMatch[3], 10),
          minute: parseInt(dateMatch[4], 10)
        })?.getTime() || null;
      }
      const clock = text.match(/(上午|早上|凌晨|中午|下午|傍晚|晚上|今晚|明晚|AM|PM|am|pm)?\s*([01]?\d|2[0-3])\s*[:：]\s*(\d{2})/);
      if (clock) {
        return this.buildDate({
          hour: parseInt(clock[2], 10),
          minute: parseInt(clock[3], 10),
          meridiem: clock[1] || ''
        })?.getTime() || null;
      }
      return null;
    }

    // batchexecute 响应 → 双周期额度（锚点式自适应解析，不依赖字段名与顺序）
    parseMaZiqcResponse(text) {
      try {
        // 标准行: [["wrb.fr","MaZiqc","<内部JSON字符串>",null,"generic"]]
        const anchor = text.indexOf('"MaZiqc"');
        if (anchor === -1) return null;
        let i = text.indexOf('"', anchor + 8);
        if (i === -1) return null;
        let decoded = '';
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const { value, next } = this.scanJsonString(text, i);
          if (value && value.length > 2) {
            try {
              const inner = JSON.parse(value);
              decoded = typeof inner === 'string' ? inner : JSON.stringify(inner);
              ok = true;
            } catch (e) { i = next; }
          } else {
            i = next;
          }
        }
        if (!ok || !decoded) return null;

        let obj;
        try { obj = JSON.parse(decoded); } catch (e) { return null; }

        // ---- 锚点式分组：找"同时含 0-100 整数 与 时间串"的最小对象节点 ----
        // 当前周期重置 = 纯时钟 ("06:37")；每周限额重置 = 带日期 ("11月3日23:37")
        const groups = [];
        const isTimeStr = (s) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ||
          /^\d{1,2}:\d{2}\s*(上午|下午|AM|PM)?$/i.test(s) || /\d{1,2}月\d{1,2}日/.test(s);
        const collect = (node) => {
          if (!node || typeof node !== 'object') return { nums: [], times: [] };
          const nums = [];
          const times = [];
          const childResults = [];
          for (const key of Object.keys(node)) {
            const v = node[key];
            if (typeof v === 'number') {
              if (Number.isFinite(v) && v >= 0 && v <= 100 && Number.isInteger(v)) nums.push(v);
            } else if (typeof v === 'string') {
              const s = v.trim();
              if (s && s.length <= 32 && isTimeStr(s)) times.push(s);
            } else if (v && typeof v === 'object') {
              childResults.push(collect(v));
            }
          }
          // 汇总子树，但保留本层分组信息供"最小分组"筛选
          const merged = {
            nums: [...nums],
            times: [...times],
            selfNums: nums,
            selfTimes: times
          };
          for (const cr of childResults) {
            merged.nums.push(...cr.nums);
            merged.times.push(...cr.times);
          }
          merged.hasBoth = merged.nums.length > 0 && merged.times.length > 0;
          merged.childHasBoth = childResults.some((cr) => cr.hasBoth);
          groups.push(merged);
          return merged;
        };
        collect(obj);

        // 取"最小命中分组"（自身同时含数字+时间，且子树无更小命中）
        const minimal = groups.filter((g) => g.hasBoth && !g.childHasBoth && g.selfNums.length > 0 && g.selfTimes.length > 0);

        let currentPct = null;
        let weeklyPct = null;
        let currentReset = '';
        let weeklyReset = '';
        for (const g of minimal) {
          const weekly = g.selfTimes.some((t) => /\d{1,2}月\d{1,2}日/.test(t));
          const pct = g.selfNums.find((n) => n <= 100);
          const time = g.selfTimes[0];
          if (weekly) {
            if (weeklyPct === null) { weeklyPct = pct; weeklyReset = time; }
          } else if (currentPct === null) {
            currentPct = pct; currentReset = time;
          }
        }

        // 兜底：没有成组命中时退回扁平顺序映射
        if (currentPct === null && weeklyPct === null) {
          const allNums = [];
          const allTimes = [];
          (function flat(n) {
            if (!n || typeof n !== 'object') return;
            for (const v of Object.values(n)) {
              if (typeof v === 'number') { if (v >= 0 && v <= 100 && Number.isInteger(v)) allNums.push(v); }
              else if (typeof v === 'string') { const s = v.trim(); if (s && s.length <= 32 && isTimeStr(s)) allTimes.push(s); }
              else flat(v);
            }
          })(obj);
          currentPct = allNums.length > 0 ? allNums[0] : null;
          weeklyPct = allNums.length > 1 ? allNums[1] : null;
          currentReset = allTimes.length > 0 ? allTimes[0] : '';
          weeklyReset = allTimes.length > 1 ? allTimes[1] : '';
        }

        if (currentPct === null && weeklyPct === null && !currentReset && !weeklyReset) return null;
        return { currentPct, weeklyPct, currentReset, weeklyReset };
      } catch (e) {
        return null;
      }
    }

    // 从 text 的 startIdx 处扫描一个完整 JSON 字符串字面量（含转义），返回解码前的原文
    scanJsonString(text, startIdx) {
      if (text[startIdx] !== '"') return { value: '', next: startIdx + 1 };
      let i = startIdx + 1;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '"') { i += 1; break; }
        i += 1;
      }
      return { value: text.slice(startIdx, i), next: i };
    }

    // 请求 interceptor 静默重放 MaZiqc（60s 最小间隔，手动可强制，绝不打开任何界面）
    requestQuotaRpcRefresh(reason = 'manual', force = false) {
      const now = Date.now();
      if (!force && now - this._lastReplayAt < 60000) return;
      this._lastReplayAt = now;
      try {
        window.postMessage({
          source: 'KIMINO_TRACKER',
          type: 'QUOTA_RPC_REPLAY',
          reason,
          timestamp: now
        }, '*');
      } catch (e) {}
    }

    startQuotaRpcRefreshLoop() {
      // 每 5 分钟静默刷新一次官方额度
      setInterval(() => this.requestQuotaRpcRefresh('periodic'), 5 * 60 * 1000);
      // 启动 3 秒后先试一次（若 interceptor 已捕获 boot 的 f.req 即可立即刷新）
      setTimeout(() => this.requestQuotaRpcRefresh('boot'), 3000);
    }

    initDomObserver() {
      const observer = new MutationObserver(() => this.scheduleScrape());

      const startObserve = () => {
        const target = document.body;
        if (target) {
          observer.observe(target, { childList: true, subtree: true, characterData: true });
          this.scheduleScrape(true);
        } else {
          setTimeout(startObserve, 500);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserve);
      } else {
        startObserve();
      }

      // 30s 安全轮询：兜住无结构性变更时的提示条文案变化 (倒计时跳变等)
      setInterval(() => this.scheduleScrape(true), 30000);
    }

    // 防抖调度：高频 DOM 突变时 600ms 合并一次，强制模式立即执行
    scheduleScrape(force = false) {
      if (force) {
        if (this._scrapeTimer) { clearTimeout(this._scrapeTimer); this._scrapeTimer = null; }
        this.runScrapes();
        return;
      }
      if (this._scrapeTimer) return;
      this._scrapeTimer = setTimeout(() => {
        this._scrapeTimer = null;
        this.runScrapes();
      }, 600);
    }

    runScrapes() {
      try { this.scanDomMetrics(); } catch (e) {}
      try { this.sniffResetHintBar(); } catch (e) {}
      try { this.scrapeRealQuotaFromDom(); } catch (e) {}
    }

    // ============ 核心：输入框上方常驻提示条嗅探 (方案 A) ============
    // 示例文案: “用量限额将在 6:37 下午 重置  查看用量  升级”
    //          “你已达到用量上限，将在 7:00 下午 重置”
    //          “Usage limit resets at 6:37 PM · See usage · Upgrade”
    sniffResetHintBar() {
      const now = Date.now();
      if (now - this._lastHintScan < 2000) return; // 2s 节流
      this._lastHintScan = now;

      const candidates = new Set();
      const fastSelectors = [
        '[class*="usage"]', '[class*="limit"]', '[class*="reset"]',
        '[class*="banner"]', '[class*="notice"]', '[class*="snackbar"]',
        '[role="status"]', '[role="alert"]', 'mat-snack-bar-container',
        '.input-area-container', '.bottom-container', '.input-area'
      ];
      try {
        document.querySelectorAll(fastSelectors.join(',')).forEach((el) => candidates.add(el));
      } catch (e) {}

      // 兜底：TreeWalker 找包含“重置/Reset”关键字的文本节点并回溯容器 (有节点上限，成本可控)
      if (candidates.size < 6) {
        for (const el of this.findElementsByKeyword(/重置|resets?\b|reset at/i, 2500)) {
          candidates.add(el);
        }
      }

      for (const el of candidates) {
        if (!el || !el.isConnected) continue;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 300) continue;
        const parsed = this.parseResetHint(text);
        if (!parsed) continue;

        const signature = `${parsed.display}|${parsed.limited ? 1 : 0}|${parsed.resetAt ? parsed.resetAt.getTime() : ''}`;
        if (signature === this._lastHintSignature) continue; // 文案未变不重复广播
        this._lastHintSignature = signature;

        // 1) 更新官方重置时间展示 (当前周期)
        if (parsed.resetAt) {
          this.sessionData.realQuota.currentResetTime = parsed.display;
          this.sessionData.realQuota.fetchedAt = now;
          this.sessionData.realQuota.isReal = true;
          this.sessionData.realQuota.resetSource = 'hint-bar';
          this.sessionData.resetTimestamp = parsed.resetAt.getTime();
          try {
            window.KIMINO_API.storageSet({
              cachedRealQuota: this.sessionData.realQuota
            });
          } catch (e) {}
        }

        // 2) 提示条宣告已限流 → 进入限流态
        if (parsed.limited) {
          this.sessionData.rateLimited = true;
          this.sessionData.status = 'rate_limited';
          if (parsed.resetAt) this.sessionData.resetTimestamp = parsed.resetAt.getTime();
        } else if (this.sessionData.rateLimited && parsed.resetAt && parsed.resetAt.getTime() > now) {
          // 限流解除但倒计时仍在走：保持限流态直到时间耗尽
          this.sessionData.resetTimestamp = parsed.resetAt.getTime();
        }

        console.log('[星语喵伴] 从常驻提示条捕获官方重置信息:', parsed.display, parsed.limited ? '(限流中)' : '');
        this.notify();
        break; // 命中一条即可
      }
    }

    // 解析提示条文案 → { resetAt: Date|null, display: string, limited: boolean }
    parseResetHint(rawText) {
      const text = (rawText || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;

      // 门禁：必须是“额度提示条”语境，避免把聊天内容里的普通“重置”误判
      const isQuotaContext = /用量限额|用量上限|额度|查看用量|usage\s*limit|resets?\s*(at|in)|see\s*usage|upgrade|升级/i.test(text);
      if (!isQuotaContext) return null;

      const limited = /已达到(用量|限额)?上限|用量已(达|到)上限|已达限额|达到限额|usage\s*limit\s*(has\s*been\s*)?(hit|reached)|you'?ve\s*(hit|reached)|you\s*(hit|reached)/i.test(text);
      const hasResetWord = /重置|resets?/i.test(text);
      if (!limited && !hasResetWord) return null;

      // ---- 相对时间: “2小时30分钟后” / “in 2h 30m” ----
      const relCn = text.match(/(\d+)\s*小时(?:\s*(\d+)\s*分(?:钟)?)?\s*(?:之?后|后)/);
      const relEn = text.match(/in\s+(\d+)\s*(?:hours?|hrs?)(?:\s+(\d+)\s*(?:minutes?|mins?))?/i);
      if (relCn || relEn) {
        const m = relCn || relEn;
        const hours = parseInt(m[1], 10) || 0;
        const mins = m[2] ? parseInt(m[2], 10) : 0;
        return {
          resetAt: new Date(Date.now() + (hours * 60 + mins) * 60000),
          display: m[0].trim(),
          limited
        };
      }

      // ---- 绝对日期: “11月3日 23:37” ----
      const dateMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*([01]?\d|2[0-3])\s*[:：点]\s*(\d{1,2})/);
      if (dateMatch) {
        const resetAt = this.buildDate({
          month: parseInt(dateMatch[1], 10),
          day: parseInt(dateMatch[2], 10),
          hour: parseInt(dateMatch[3], 10),
          minute: parseInt(dateMatch[4], 10)
        });
        return { resetAt, display: dateMatch[0].trim(), limited };
      }

      // ---- 绝对时刻: “下午 6:37” / “6:37 下午” / “18:37” / “6:37 PM” ----
      let hour = null;
      let minute = null;
      let meridiem = '';
      let display = '';

      const timeBefore = text.match(/(上午|早上|凌晨|中午|下午|傍晚|晚上|今晚|明晚|AM|PM|am|pm)\s*([01]?\d|2[0-3])\s*[:：]\s*(\d{2})/);
      const timeAfter = text.match(/([01]?\d|2[0-3])\s*[:：]\s*(\d{2})\s*(上午|早上|凌晨|中午|下午|傍晚|晚上|今晚|明晚|AM|PM|am|pm)?/);

      if (timeBefore) {
        meridiem = timeBefore[1];
        hour = parseInt(timeBefore[2], 10);
        minute = parseInt(timeBefore[3], 10);
        display = timeBefore[0].trim();
      } else if (timeAfter) {
        hour = parseInt(timeAfter[1], 10);
        minute = parseInt(timeAfter[2], 10);
        meridiem = timeAfter[3] || '';
        display = timeAfter[0].trim();
      }

      if (hour === null) return null;

      const isTomorrow = /明天|明晚|tomorrow/i.test(text);
      const resetAt = this.buildDate({
        hour,
        minute,
        meridiem,
        tomorrow: isTomorrow
      });
      if (!resetAt) return null;
      return { resetAt, display, limited };
    }

    // 时间拼装：12/24 小时制归一 + 过期自动顺延一天/一年
    buildDate({ month, day, hour, minute, meridiem = '', tomorrow = false }) {
      try {
        let h = hour;
        const m = minute || 0;
        const am = /上午|早上|凌晨|AM/i.test(meridiem);
        const pm = /下午|傍晚|晚上|今晚|明晚|PM/i.test(meridiem);
        if (pm && h < 12) h += 12;
        if (am && h === 12) h = 0;

        const now = new Date();
        const target = new Date(now.getFullYear(), month ? month - 1 : now.getMonth(), day || now.getDate(), h, m, 0, 0);
        if (tomorrow) target.setDate(target.getDate() + 1);

        if (month && day) {
          // 指定日期：已过期则顺延一年
          if (target.getTime() <= now.getTime() - 60000) target.setFullYear(target.getFullYear() + 1);
        } else {
          // 指定时刻：已过期则顺延一天
          if (target.getTime() <= now.getTime() - 60000) target.setDate(target.getDate() + 1);
        }
        return target;
      } catch (e) {
        return null;
      }
    }

    // 关键字文本搜索 (TreeWalker，带节点上限防止超大 DOM 卡顿)，回溯至有意义的容器
    findElementsByKeyword(keywordRegex, maxNodes = 2000) {
      const found = [];
      try {
        const walker = document.createTreeWalker(
          document.body || document.documentElement,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue || node.nodeValue.length > 300) return NodeFilter.FILTER_REJECT;
              return keywordRegex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
          }
        );
        let count = 0;
        let node = walker.nextNode();
        while (node && count < maxNodes) {
          count += 1;
          // 从文本节点向上回溯，找到文本量适中的祖先容器（提示条通常很短）
          let el = node.parentElement;
          let depth = 0;
          while (el && depth < 6) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length > 16) {
              if (t.length <= 300) { found.push(el); }
              break;
            }
            el = el.parentElement;
            depth += 1;
          }
          node = walker.nextNode();
        }
      } catch (e) {}
      return found;
    }

    // ============ Google 原生“用量限额”弹窗嗅探 (手动打开弹窗时的高价值同步) ============
    scrapeRealQuotaFromDom() {
      const now = Date.now();
      if (now - this._lastDialogScan < 3000) return; // 3s 节流
      this._lastDialogScan = now;

      const dialogs = document.querySelectorAll('[role="dialog"], [role="region"], mat-dialog-container, .cdk-overlay-container [role="presentation"]');
      for (const el of dialogs) {
        const text = el.innerText || el.textContent || '';
        if (text.includes('用量限额') && (text.includes('当前用量') || text.includes('每周限额'))) {
          let currentPct = null;
          let currentReset = '';
          let weeklyPct = null;
          let weeklyReset = '';

          // 匹配“当前用量 ... 已使用 67% ... 重置时间: 01:37”
          const curMatch = text.match(/当前用量[\s\S]*?已使用\s*(\d+)%/i) || text.match(/已使用\s*(\d+)%[\s\S]*?重置时间:\s*([^\n\r]+)/i);
          if (curMatch) currentPct = parseInt(curMatch[1], 10);
          const curResetMatch = text.match(/当前用量[\s\S]*?重置时间:\s*([0-9:apmAPM\s]+)的/i) || text.match(/当前用量[\s\S]*?重置时间:\s*([0-9:apmAPM\s]+)/i) || text.match(/重置时间:\s*([0-9:apmAPM\s]+)/i);
          if (curResetMatch) currentReset = curResetMatch[1].trim();

          // 匹配“每周限额 ... 已使用 64% ... 重置时间: 11月3日23:37”
          const weekMatch = text.match(/每周限额[\s\S]*?已使用\s*(\d+)%/i);
          if (weekMatch) weeklyPct = parseInt(weekMatch[1], 10);
          const weekResetMatch = text.match(/每周限额[\s\S]*?重置时间:\s*([^\n\r]+)/i);
          if (weekResetMatch) weeklyReset = weekResetMatch[1].trim();

          if (currentPct !== null || weeklyPct !== null) {
            this.updateRealQuota({
              currentUsagePercent: currentPct !== null ? currentPct : this.sessionData.realQuota.currentUsagePercent,
              currentResetTime: currentReset || this.sessionData.realQuota.currentResetTime,
              weeklyUsagePercent: weeklyPct !== null ? weeklyPct : this.sessionData.realQuota.weeklyUsagePercent,
              weeklyResetTime: weeklyReset || this.sessionData.realQuota.weeklyResetTime,
              resetSource: 'native-dialog',
              fetchedAt: now,
              isReal: true
            });
            break;
          }
        }
      }
    }

    updateRealQuota(data) {
      if (!data) return;
      this.sessionData.realQuota = { ...this.sessionData.realQuota, ...data, isReal: true, fetchedAt: Date.now() };
      try {
        window.KIMINO_API.storageSet({ cachedRealQuota: this.sessionData.realQuota });
      } catch (e) {}
      console.log('[星语喵伴] 成功捕获 Google 官方真实额度:', this.sessionData.realQuota);
      this.notify();
    }

    scanDomMetrics() {
      const now = Date.now();
      if (now - this._lastMetricsScan < 1200) return; // 1.2s 节流
      this._lastMetricsScan = now;

      // 1. 用户提问
      const userQueries = document.querySelectorAll('user-query, .user-query, [data-test-id="user-query"]');
      let promptChars = 0;
      userQueries.forEach(el => {
        promptChars += (el.textContent || '').length;
      });

      // 2. 模型回答
      const modelResponses = document.querySelectorAll('model-response, [data-test-id="model-response"]');
      let outputChars = 0;
      modelResponses.forEach(el => {
        outputChars += (el.textContent || '').length;
      });

      // 3. 思考过程
      const thinkingBlocks = document.querySelectorAll('details, .thought-container, [data-test-id="thinking-process"]');
      let thinkingChars = 0;
      thinkingBlocks.forEach(el => {
        thinkingChars += (el.textContent || '').length;
      });

      const turns = Math.max(userQueries.length, modelResponses.length);
      if (turns !== this.sessionData.turns ||
          Math.abs(promptChars - this.sessionData.userPromptChars) > 30 ||
          Math.abs(outputChars - this.sessionData.modelOutputChars) > 30) {
        this.sessionData.turns = turns;
        this.sessionData.userPromptChars = promptChars;
        this.sessionData.modelOutputChars = outputChars;
        this.sessionData.thinkingChars = thinkingChars;
        this.notify();
      }

      this.detectRateLimitFromDom();
    }

    detectRateLimitFromDom() {
      const alertElements = document.querySelectorAll('[role="alert"], .snack-bar, .toast, .banner, [data-test-id="error-message"]');
      for (const el of alertElements) {
        const text = el.textContent || '';
        if (text.includes('limit') || text.includes('reached') || text.includes('上限') || text.includes('限流') || text.includes('额度') || text.includes('重试')) {
          this.triggerRateLimit(text);
          break;
        }
      }
    }

    // explicitResetAt: 由提示条/弹窗解析出的真实重置时间戳 (可选)
    triggerRateLimit(reason = '', explicitResetAt = null) {
      if (this.sessionData.rateLimited && !explicitResetAt) return;
      this.sessionData.rateLimited = true;
      this.sessionData.status = 'rate_limited';

      let resetMs = 3 * 60 * 60 * 1000;
      const matchHours = reason.match(/(\d+)\s*(?:hour|小时|hr)/i);
      if (matchHours) resetMs = parseInt(matchHours[1], 10) * 3600 * 1000;
      const matchMin = reason.match(/(\d+)\s*(?:minute|分钟|min)/i);
      if (matchMin) resetMs = parseInt(matchMin[1], 10) * 60 * 1000;

      this.sessionData.resetTimestamp = explicitResetAt || (Date.now() + resetMs);
      this.notify();
    }

    startCountdownTimer() {
      setInterval(() => {
        if (!this.sessionData.resetTimestamp) return;
        const diff = this.sessionData.resetTimestamp - Date.now();
        if (diff <= 0) {
          this.sessionData.rateLimited = false;
          this.sessionData.resetTimestamp = null;
          this.sessionData.resetCountdownText = '';
          this.sessionData.status = 'idle';
          this._lastHintSignature = ''; // 允许提示条重新广播
          this.notify();
        } else {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          this.sessionData.resetCountdownText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
          this.notify();
        }
      }, 1000);
    }

    initUrlListener() {
      let lastUrl = window.location.href;
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          const newChatId = this.extractChatId();
          if (newChatId !== this.currentChatId) {
            this.currentChatId = newChatId;
            this.sessionData.chatId = newChatId;
            this.sessionData.turns = 0;
            this.sessionData.userPromptChars = 0;
            this.sessionData.modelOutputChars = 0;
            this.sessionData.thinkingChars = 0;
            this.sessionData.promptTokensEst = 0;
            this.sessionData.outputTokensEst = 0;
            this.sessionData.thinkingTokensEst = 0;
            this.sessionData.totalTokensEst = 0;
            this.notify();
            setTimeout(() => this.scheduleScrape(true), 600);
          }
        }
      }, 800);
    }
  }

  try {
    window.__KIMINO_TRACKER__ = new KiminoTracker();
  } catch (e) {
    console.error('[星语喵伴] 追踪器初始化失败 (不影响桌宠与皮肤):', e);
  }
})();
