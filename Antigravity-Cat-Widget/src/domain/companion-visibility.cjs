// The host can remain available in the background. Only actual foreground
// metadata may override the Web focus owner; a taskbar excursion preserves it.
class CompanionVisibility {
  constructor() { this.webOwnsDisplay = false; }
  hideDesktop(mode, web, foreground) {
    if (mode !== 'prefer-web' || !web?.online) return (this.webOwnsDisplay = false);
    const kind = foreground?.foregroundKind;
    if (['host', 'self', 'desktop', 'other'].includes(kind)) return (this.webOwnsDisplay = false);
    if (kind === 'shell') {
      if (web.visible === false) return (this.webOwnsDisplay = false);
      return (this.webOwnsDisplay = this.webOwnsDisplay || web.active === true);
    }
    return (this.webOwnsDisplay = web.active === true);
  }
}
module.exports = { CompanionVisibility };
