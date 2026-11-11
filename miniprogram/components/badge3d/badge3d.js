const BadgeRenderer = require('./renderer');
const createEngraving = require('./engraving');
const { engravingArea } = require('./layout');
const { text } = require('../../config');
const ENV = '/components/badge3d/assets';
const geometryCache = new Map();

Component({
  properties: {
    rotationMode: { type: String, value: 'snap', observer(value) { if (this._engine?.edge) this._engine.setRotationMode(value); } },
    preview: { type: Boolean, value: false, observer() { if (this._attached) this.load(); } },
    thicknessMm: {
      type: Number, value: -1,
      observer(value) {
        if (!this._engine?.edge) return;
        try { this._engine.setThickness(value >= 0 ? value : (this.data.badge?.thicknessMm ?? .6)); }
        catch (error) { this.fallback(); }
      },
    },
    badge: { type: Object, value: null, observer() { if (this._attached) this.load(); } },
  },
  data: { ready: false },
  lifetimes: {
    ready() { this._attached = true; this.load(); },
    detached() { this._attached = false; this.release(); },
  },
  pageLifetimes: {
    hide() { this._engine?.pause(); },
    show() { this._engine?.resume(); },
  },
  methods: {
    release() {
      this._requests?.forEach(request => request.abort()); this._requests = [];
      this._engine?.dispose(); this._engine = null;
    },
    fallback() {
      this._generation = (this._generation || 0) + 1;
      this.release();
      if (this._attached) this.triggerEvent('fallback', { key: this.data.badge?.key });
    },
    load() {
      const badge = this.data.badge;
      const identity = JSON.stringify([badge?.key, badge?.model3dUrl, badge?.frontImage, badge?.backImage, badge?.thicknessMm, badge?.serialNo, badge?.ownerName, badge?.unlocked, badge?.engravingModels, this.data.preview]);
      if (identity === this._loadedBadge) return;
      this._loadedBadge = identity;
      this.release();
      const generation = this._generation = (this._generation || 0) + 1;
      if ((!badge?.unlocked && !this.data.preview) || !badge?.model3dUrl) { this.fallback(); return; }
      this.setData({ ready: false }, () => {
        this.createSelectorQuery().select('#badge-canvas').fields({ node: true, computedStyle: ['width', 'height'] }).exec(async results => {
          let engine;
          try {
            if (generation !== this._generation || !this._attached) return;
            const { node, width, height } = results[0];
            engine = this._engine = new BadgeRenderer(node, parseFloat(width), parseFloat(height), () => this.fallback());
            const modelUrls = [...new Set([badge.model3dUrl, ...(badge.engravingModels || [])])];
            const modelRequest = Promise.all(modelUrls.map(url => {
              const key = url.split('?')[0];
              if (geometryCache.has(key)) return Promise.resolve(geometryCache.get(key));
              return new Promise((resolve, reject) => {
                const request = wx.downloadFile({ url, timeout: 7500,
                  success: result => {
                    if (result.statusCode !== 200) { reject(new Error('Badge model unavailable')); return; }
                    try {
                      const model = JSON.parse(wx.getFileSystemManager().readFileSync(result.tempFilePath, 'utf8'));
                      if (model.version !== 1 || !model.contours?.[0]?.length || !model.safe) throw new Error('Unsupported badge geometry');
                      geometryCache.set(key, model); resolve(model);
                    } catch (error) { reject(error); }
                  },
                  fail: reject,
                });
                this._requests.push(request);
              });
            }));
            const [models, front, environment] = await Promise.all([modelRequest, engine.loadTexture(badge.frontImage), engine.loadEnvironment(ENV)]);
            if (generation !== this._generation || !this._attached) return;
            this._requests = [];
            const model = models[0];
            const maps = await createEngraving(engine.THREE, badge, model, text.app_name, engravingArea(models));
            if (generation !== this._generation || !this._attached) { Object.values(maps).forEach(t => t.dispose()); return; }
            const back = engine.own(maps.color), bump = engine.own(maps.bump), roughness = engine.own(maps.roughness);
            front.encoding = back.encoding = engine.THREE.sRGBEncoding;
            engine.build(model, front, back, bump, roughness, environment, this.data.thicknessMm >= 0 ? this.data.thicknessMm : badge.thicknessMm);
            engine.onIntroComplete = () => {
              if (generation === this._generation && this._attached) this.triggerEvent('introcomplete', { key: badge.key });
            };
            engine.setRotationMode(this.data.rotationMode);
            this.setData({ ready: true }, () => this.triggerEvent('ready', { key: badge.key }));
          } catch (error) {
            engine?.dispose();
            if (generation === this._generation && this._attached) {
              console.warn('徽章 3D 不可用，沿用 2D 展示', error);
              this.fallback();
            }
          }
        });
      });
    },
    resetToFront() { return this._engine?.resetToFront(); },
    dragStart(e) { const p = e.touches[0]; this._engine?.dragStart(p.clientX, p.clientY); },
    dragMove(e) { const p = e.touches[0]; this._engine?.dragMove(p.clientX, p.clientY); },
    dragEnd() { this._engine?.dragEnd(); },
    dragCancel() { this._engine?.dragEnd(true); },
  },
});
