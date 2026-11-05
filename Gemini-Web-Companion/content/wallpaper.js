// Decode first, then crossfade one incoming image over the current image. A rapid
// sequence keeps only the latest pending image, without exposing a blank frame.
(() => {
  if (window.KiminoWallpaper) return;
  const timing = { duration: 1300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
  const background = url => 'linear-gradient(rgba(20,15,35,.38),rgba(20,15,35,.62)),url(' + JSON.stringify(url) + ')';
  window.KiminoWallpaper = class {
    constructor(root, changed = () => {}) {
      this.root = root;
      this.changed = changed;
      this.generation = 0;
      this.requested = '';
      this.current = '';
      this.pending = null;
    }
    async setSource(url, transition = 'fade') {
      this.transition = transition;
      if (transition === 'none' && this.root.__kgWallpaperStage) {
        const target = this.pending || this.root.__kgWallpaperStage.url;
        this.pending = null;
        this.commit(target);
      }
      if (this.requested === url) return true;
      this.requested = url;
      const generation = ++this.generation;
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (generation !== this.generation) return false;
        if (!this.current || this.transition === 'none') this.commit(url);
        else if (this.root.__kgWallpaperStage) this.pending = url;
        else this.start(url);
        return true;
      } catch {
        if (generation === this.generation) this.requested = '';
        return false; // Keep the last decoded image on failure.
      }
    }
    start(url) {
      if (url === this.current) return;
      const element = document.createElement('div');
      element.className = 'kimino-wallpaper-incoming';
      element.style.backgroundImage = background(url);
      this.root.appendChild(element);
      const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      const stage = { url, element, animation };
      this.root.__kgWallpaperStage = stage;
      animation.onfinish = () => {
        if (this.root.__kgWallpaperStage !== stage) return;
        const pending = this.pending;
        this.pending = null;
        this.commit(url);
        if (pending) this.start(pending);
      };
      this.changed();
    }
    commit(url) {
      const stage = this.root.__kgWallpaperStage;
      if (stage) { stage.animation.onfinish = null; stage.animation.cancel(); stage.element.remove(); }
      delete this.root.__kgWallpaperStage;
      this.root.style.backgroundImage = background(url);
      this.root.__kgSrc = this.current = url;
      this.changed();
    }
    stop() {
      ++this.generation;
      this.requested = '';
      this.pending = null;
      if (this.root.__kgWallpaperStage) this.commit(this.root.__kgWallpaperStage.url);
    }
    static mirror(source, target) {
      if (target.style.backgroundImage !== source.style.backgroundImage) target.style.backgroundImage = source.style.backgroundImage;
      const stage = source.__kgWallpaperStage;
      if (target.__kgMirrorStage === stage) return;
      target.__kgMirrorAnimation?.cancel();
      target.querySelector('.kimino-wallpaper-incoming')?.remove();
      target.__kgMirrorStage = stage;
      if (!stage) return;
      const element = document.createElement('div');
      element.className = 'kimino-wallpaper-incoming';
      element.style.backgroundImage = stage.element.style.backgroundImage;
      target.appendChild(element);
      const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      if (stage.animation.startTime !== null) animation.startTime = stage.animation.startTime;
      else animation.currentTime = stage.animation.currentTime || 0;
      target.__kgMirrorAnimation = animation;
    }
  };
})();
