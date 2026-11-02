// 星语喵伴 · Session Quota & Token Tracker
(() => {
  class KiminoTracker {
    constructor() {
      this.listeners = new Set();
      this.currentChatId = this.extractChatId();
      this.config = {
        argonMaxSafeTurns: 8,
        argonMaxSafeTokens: 25000
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
        status: 'idle', // idle, thinking, warning, exhausted, rate_limited
        rateLimited: false,
        resetTimestamp: null,
        resetCountdownText: '',
        lastActiveTime: Date.now()
      };

      this.initNetworkListener();
      this.initDomObserver();
      this.initUrlListener();
      this.startCountdownTimer();
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
        try { cb(this.sessionData); } catch (e) { console.error(e); }
      }
    }

    calculateMetrics() {
      this.sessionData.promptTokensEst = Math.round(this.sessionData.userPromptChars * 0.7);
      this.sessionData.outputTokensEst = Math.round(this.sessionData.modelOutputChars * 0.7);
      this.sessionData.thinkingTokensEst = Math.round(this.sessionData.thinkingChars * 0.7);
      this.sessionData.totalTokensEst = this.sessionData.promptTokensEst + this.sessionData.outputTokensEst + this.sessionData.thinkingTokensEst;

      const turnRatio = this.sessionData.turns / Math.max(1, this.config.argonMaxSafeTurns);
      const tokenRatio = this.sessionData.totalTokensEst / Math.max(1, this.config.argonMaxSafeTokens);
      const rawPercent = Math.max(turnRatio, tokenRatio) * 100;

      if (this.sessionData.rateLimited) {
        this.sessionData.fatiguePercent = 100;
        this.sessionData.status = 'rate_limited';
      } else {
        this.sessionData.fatiguePercent = Math.min(99, Math.round(rawPercent));
        if (this.sessionData.fatiguePercent >= 80) {
          this.sessionData.status = 'exhausted';
        } else if (this.sessionData.fatiguePercent >= 50) {
          this.sessionData.status = 'warning';
        } else if (this.sessionData.status !== 'thinking') {
          this.sessionData.status = 'idle';
        }
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
        }
      });
    }

    initDomObserver() {
      const observer = new MutationObserver(() => {
        this.scanDomMetrics();
      });

      const startObserve = () => {
        const target = document.body;
        if (target) {
          observer.observe(target, { childList: true, subtree: true, characterData: true });
          this.scanDomMetrics();
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

    scanDomMetrics() {
      const userQueries = document.querySelectorAll('.user-query-container, user-query, [data-test-id="user-query"]');
      let promptChars = 0;
      userQueries.forEach(el => {
        promptChars += (el.textContent || '').length;
      });

      const modelResponses = document.querySelectorAll('model-response, response-container, [data-test-id="model-response"]');
      let outputChars = 0;
      modelResponses.forEach(el => {
        outputChars += (el.textContent || '').length;
      });

      const thinkingBlocks = document.querySelectorAll('details, .thought-container, [data-test-id="thinking-process"], .thinking-content');
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
      console.warn('[星语喵伴] 捕获到限流告警喵！原因:', reason);
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
            this.sessionData.fatiguePercent = 0;
            this.sessionData.status = 'idle';
            this.notify();
            setTimeout(() => this.scanDomMetrics(), 600);
          }
        }
      }, 800);
    }
  }

  window.__KIMINO_TRACKER__ = new KiminoTracker();
})();
