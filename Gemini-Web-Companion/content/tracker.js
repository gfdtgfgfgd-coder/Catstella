// 星语喵伴 · Quota & Token Sniffer (支持 Google 原生用量限额双周期同步)
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
          currentResetTime: '',      // 例如 "01:37"
          weeklyUsagePercent: null,  // 例如 64%
          weeklyResetTime: '',       // 例如 "11月3日23:37"
          fetchedAt: null,
          isReal: false
        }
      };

      this.loadCachedQuota();
      this.initNetworkListener();
      this.initDomObserver();
      this.initUrlListener();
      this.startCountdownTimer();
    }

    extractChatId() {
      const match = window.location.pathname.match(/\/app\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : 'default';
    }

    async loadCachedQuota() {
      try {
        const res = await chrome.storage.local.get(['cachedRealQuota']);
        if (res?.cachedRealQuota && (Date.now() - res.cachedRealQuota.fetchedAt < 1000 * 60 * 60 * 4)) {
          this.sessionData.realQuota = res.cachedRealQuota;
          this.notify();
        }
      } catch (e) {}
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

      // 如果有官方真实配额数据，以官方真实当前用量为主！
      if (typeof this.sessionData.realQuota.currentUsagePercent === 'number') {
        this.sessionData.fatiguePercent = this.sessionData.realQuota.currentUsagePercent;
      } else {
        const turnRatio = this.sessionData.turns / Math.max(1, this.config.argonMaxSafeTurns);
        const tokenRatio = this.sessionData.totalTokensEst / Math.max(1, this.config.argonMaxSafeTokens);
        this.sessionData.fatiguePercent = Math.min(99, Math.round(Math.max(turnRatio, tokenRatio) * 100));
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
        if (event.data?.source !== 'KIMINO_INTERCEPTOR') return;
        const { type, data } = event.data;

        if (type === 'STREAM_START') {
          this.sessionData.status = 'thinking';
          this.sessionData.lastActiveTime = Date.now();
          this.notify();
        } else if (type === 'STREAM_COMPLETE') {
          this.sessionData.status = 'idle';
          this.sessionData.lastActiveTime = Date.now();
          this.scanDomMetrics();
        } else if (type === 'RATE_LIMIT_HIT') {
          this.triggerRateLimit('网络返回 429 配额用尽');
        } else if (type === 'QUOTA_SNIFFED') {
          this.updateRealQuota(data);
        }
      });
    }

    initDomObserver() {
      const observer = new MutationObserver(() => {
        this.scanDomMetrics();
        this.scrapeRealQuotaFromDom();
      });

      const startObserve = () => {
        const target = document.body;
        if (target) {
          observer.observe(target, { childList: true, subtree: true, characterData: true });
          this.scanDomMetrics();
          this.scrapeRealQuotaFromDom();
        } else {
          setTimeout(startObserve, 500);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserve);
      } else {
        startObserve();
      }
    }

    // 核心特性：自动嗅探 Google 网页端原生“用量限额 PRO”弹窗数据！
    scrapeRealQuotaFromDom() {
      const dialogs = document.querySelectorAll('[role="dialog"], [role="region"], mat-dialog-container, .modal, div');
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
          const curResetMatch = text.match(/当前用量[\s\S]*?重置时间:\s*([0-9:apmAPM\s]+)/i) || text.match(/重置时间:\s*([0-9:apmAPM\s]+)/i);
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
              fetchedAt: Date.now(),
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
        chrome.storage.local.set({ cachedRealQuota: this.sessionData.realQuota });
      } catch (e) {}
      console.log('[星语喵伴] 成功捕获 Google 官方真实额度:', this.sessionData.realQuota);
      this.notify();
    }

    scanDomMetrics() {
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

    triggerRateLimit(reason = '') {
      if (this.sessionData.rateLimited) return;
      this.sessionData.rateLimited = true;
      this.sessionData.status = 'rate_limited';

      let resetMs = 3 * 60 * 60 * 1000;
      const matchHours = reason.match(/(\d+)\s*(?:hour|小时|hr)/i);
      if (matchHours) resetMs = parseInt(matchHours[1], 10) * 3600 * 1000;
      const matchMin = reason.match(/(\d+)\s*(?:minute|分钟|min)/i);
      if (matchMin) resetMs = parseInt(matchMin[1], 10) * 60 * 1000;

      this.sessionData.resetTimestamp = Date.now() + resetMs;
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
            setTimeout(() => {
              this.scanDomMetrics();
              this.scrapeRealQuotaFromDom();
            }, 600);
          }
        }
      }, 800);
    }
  }

  window.__KIMINO_TRACKER__ = new KiminoTracker();
})();
