Component({
  options: { multipleSlots: true },
  properties: {
    closeOnMask: { type: Boolean, value: true },
    maxHeight: { type: String, value: '80vh' },
    show: {
      type: Boolean,
      value: false,
      observer(show) {
        if (show) {
          // Reopening cancels the previous close, including its delayed cleanup.
          clearTimeout(this._timer);
          this._timer = null;
          this.setData({ internalShow: true, closing: false });
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
    closing: false,
    internalShow: false,
  },

  methods: {
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
      clearTimeout(this._timer);
      this._timer = null;
    },
  },
});
