Component({
  options: { multipleSlots: true },
  properties: {
    closeOnMask: { type: Boolean, value: true },
    maxHeight: { type: String, value: '80vh' },
    // 有底栏时传 true：底栏固定在正文下方，底部安全区由底栏负责
    footer: { type: Boolean, value: false },
    // 正文滚动到指定 id 的元素
    scrollIntoView: { type: String, value: '' },
    show: {
      type: Boolean,
      value: false,
      observer(show) {
        if (show) {
          // Reopening cancels the previous close, including its delayed cleanup.
          clearTimeout(this._timer);
          this._timer = null;
          this.setData({ internalShow: true, closing: false }, () => this._measureBody());
        } else if (this.data.internalShow) {
          this._autoHide();
        }
      },
    },
    position: {
      type: String,
      value: 'bottom',
    },
    zindex: {
      type: Number,
      value: 999999,
      observer(value) {
        // Older callers use local levels like 2; modals must stay above page UI.
        this.setData({ layerZ: Math.max(999999, value) });
      },
    },
  },

  data: {
    layerZ: 999999,
    // 正文最大高度（px）：弹窗最大高度减去标题栏和底栏。scroll-view 需要明确的高度上限才能滚动
    bodyMaxHeight: 0,
    closing: false,
    internalShow: false,
  },

  methods: {
    // 把 maxHeight（vh / rpx / px）换算成 px
    _toPx(value) {
      const { windowHeight, windowWidth } = wx.getWindowInfo();
      const num = parseFloat(value) || 0;
      if (/vh$/.test(value)) return num * windowHeight / 100;
      if (/rpx$/.test(value)) return num * windowWidth / 750;
      return num;
    },

    // 打开后量出标题栏、底栏高度，算出正文可用的最大高度
    _measureBody() {
      // 标题栏里的组件渲染完成前高度可能偏小：下一帧量一次，稍后再校准一次
      wx.nextTick(() => this._measureOnce());
      clearTimeout(this._measureTimer);
      this._measureTimer = setTimeout(() => this._measureOnce(), 120);
    },

    _measureOnce() {
      this.createSelectorQuery()
        .select('.popup-header-area').boundingClientRect()
        .select('.popup-footer-area').boundingClientRect()
        .exec(([header, footer]) => {
          const used = (header ? header.height : 0) + (footer ? footer.height : 0);
          const bodyMaxHeight = Math.max(0, Math.floor(this._toPx(this.data.maxHeight) - used));
          if (bodyMaxHeight !== this.data.bodyMaxHeight) this.setData({ bodyMaxHeight });
        });
    },

    _autoHide() {
      if (this.data.closing) return;
      this.setData({ closing: true });
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this._timer = null;
        this.setData({ internalShow: false, closing: false });
      }, 300);
    },

    hide() {
      if (this.data.closing) return;
      // The owner accepts or rejects the request by updating show.
      this.triggerEvent('close');
    },

    onMaskTap() {
      if (this.data.closeOnMask) this.hide();
    },
  },

  lifetimes: {
    detached() {
      clearTimeout(this._measureTimer);
      clearTimeout(this._timer);
      this._timer = null;
    },
  },
});
