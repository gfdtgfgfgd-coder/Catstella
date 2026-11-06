class ModelActivity {
  constructor(now = Date.now) {
    this.now = now;
    this.running = new Map();
    this.finished = null;
  }
  get size() { return this.running.size; }
  begin(id, stepIndex) {
    if (this.running.has(id)) return false;
    this.running.set(id, stepIndex);
    this.finished = null;
    return true;
  }
  end(id, stepIndex, kind, confirmed = false) {
    const tracked = this.running.delete(id);
    if (!tracked && (!confirmed || this.running.size)) return false;
    if (!this.running.size) this.finished = { kind, stepIndex, expiresAt: this.now() + 4500 };
    return true;
  }
  clear() {
    this.running.clear();
    this.finished = null;
  }
  snapshot() {
    if (this.running.size) {
      let stepIndex;
      for (const index of this.running.values()) stepIndex = index;
      return { kind: "model-running", stepIndex };
    }
    return this.finished?.expiresAt > this.now() ? this.finished : null;
  }
}
module.exports = { ModelActivity };
