import { signCosUrl } from '../../utils/common';

// Public badge viewer. The renderer and its Three.js dependency stay in an async subpackage.
Component({
  properties: {
    badge: {
      type: Object, value: null,
      observer(value) {
        if (!this._live && value) this.setData({ badgeMode: 'loading' });
        if (this._live) this.prepare();
      },
    },
    thicknessMm: { type: Number, value: -1 },
    // auto: 持续旋转；snap: 手动吸附；intro: 转一圈后吸附。
    rotationMode: { type: String, value: 'snap', observer(value, previous) { if (value !== previous) this.setData({ introPlayed: false }); } },
    preview: { type: Boolean, value: false, observer() { if (this._live) this.prepare(); } },
    active: { type: Boolean, value: true, observer() { if (this._live) this.prepare(); } },
    // Retain the lightweight flip interface for existing front/back callers.
    front: { type: String, value: '', observer() { this.setData({ flipped: false, frontFailed: false }); } },
    back: String,
    size: { type: Number, value: 240 },
  },
  data: { introPlayed: false, badgeMode: '2d', resolvedBadge: null, flipped: false, frontFailed: false },
  lifetimes: {
    ready() { this._live = true; this.prepare(); },
    detached() { this._live = false; this._version++; clearTimeout(this._timer); },
  },
  methods: {
    async prepare() {
      const badge = this.data.badge, active = this.data.active;
      const identity = JSON.stringify([badge?.key, badge?.frontImage, badge?.backImage, badge?.model3dUrl, badge?.thicknessMm, badge?.ownerName, badge?.serialNo, badge?.unlocked, badge?.engravingModels, this.data.preview]);
      if (identity === this._identity && active === this._active) return;
      if (identity !== this._identity) this.setData({ introPlayed: false });
      this._identity = identity; this._active = active;
      const version = this._version = (this._version || 0) + 1;
      clearTimeout(this._timer);
      this.setData({ flipped: false, frontFailed: false });
      if (!badge) { this.setData({ resolvedBadge: null, badgeMode: '2d' }); return; }
      if (!active && this.data.resolvedBadge?.key === badge.key) {
        this.setData({ badgeMode: '2d' });
        return;
      }
      this.setData({ badgeMode: 'loading' });
      const wants3d = active && (badge.unlocked || this.data.preview) && badge.model3dUrl && this._failedIdentity !== identity;
      this._timer = setTimeout(() => this.use2d(), 8000);
      const sign = url => url ? signCosUrl(url) : Promise.resolve('');
      try {
        const [frontImage, backImage, model3dUrl, engravingModels] = await Promise.all([
          sign(badge.frontImage),
          (badge.unlocked || this.data.preview) ? sign(badge.backImage) : Promise.resolve(''),
          wants3d ? sign(badge.model3dUrl) : Promise.resolve(''),
          wants3d ? Promise.all((badge.engravingModels || []).map(sign)) : Promise.resolve([]),
        ]);
        if (!this._live || version !== this._version) return;
        const resolvedBadge = { ...badge, frontImage, backImage, model3dUrl, engravingModels };
        let show3d = wants3d && this._failedIdentity !== identity;
        if (show3d && !await this.waitForLayout(version)) return;
        show3d = show3d && this._failedIdentity !== identity;
        if (!show3d) clearTimeout(this._timer);
        this.setData({ resolvedBadge, badgeMode: show3d ? '3d' : '2d' });
      } catch (error) {
        if (!this._live || version !== this._version) return;
        this.setData({ resolvedBadge: badge });
        this.use2d();
      }
    },
    async waitForLayout(version) {
      let previous;
      while (this._live && version === this._version && this._failedIdentity !== this._identity) {
        const [rect, style] = await new Promise(resolve => this.createSelectorQuery()
          .select('.badge-scene').boundingClientRect()
          .select('.badge-scene').fields({ computedStyle: ['width', 'height'] }).exec(resolve));
        if (!this._live || version !== this._version) return false;
        if (rect && style && previous &&
            Math.abs(rect.width - parseFloat(style.width)) < .1 &&
            Math.abs(rect.height - parseFloat(style.height)) < .1 &&
            Math.abs(rect.left - previous.left) < .1 && Math.abs(rect.top - previous.top) < .1) return true;
        previous = rect;
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      return false;
    },
    async resetToFront() {
      const renderer = this.selectComponent('#badge-renderer');
      if (renderer) await renderer.resetToFront();
      else if (this.data.flipped) {
        this.setData({ flipped: false });
        await new Promise(resolve => setTimeout(resolve, 560));
      }
    },
    use2d() {
      clearTimeout(this._timer);
      this._failedIdentity = this._identity;
      if (this._live) this.setData({ badgeMode: '2d', resolvedBadge: this.data.resolvedBadge || this.data.badge });
    },
    viewerReady(e) {
      if (e.detail.key !== this.data.badge?.key) return;
      clearTimeout(this._timer);
      this.triggerEvent('ready', e.detail);
    },
    introComplete(e) {
      if (e.detail.key === this.data.badge?.key) this.setData({ introPlayed: true });
    },
    viewerFailed(e) { if (e.detail.key === this.data.badge?.key) this.use2d(); },
    flip() {
      if (this.data.badgeMode !== '2d' || (this.data.badge && ((!this.data.badge.unlocked && !this.data.preview) || !this.data.active))) return;
      this.setData({ flipped: !this.data.flipped });
    },
    onFrontError() { this.setData({ frontFailed: true }); },
  },
});
