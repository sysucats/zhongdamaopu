// 公共滑杆：半透明滑块 + 圆角轨道，按住轨道任意位置即可拖动。
// 原生 slider 只保留给读屏（透明、不接收触摸），外观与手势都在这里自绘。
// track: 自定义轨道背景（如色相渐变），传了就不画填充段；ticks: 刻度值数组
Component({
  properties: {
    min: { type: Number, value: 0 },
    max: { type: Number, value: 100 },
    step: { type: Number, value: 1 },
    value: { type: Number, value: 0 },
    disabled: { type: Boolean, value: false },
    track: { type: String, value: '' },
    ticks: { type: Array, value: [] },
    ariaLabel: { type: String, value: '' },
  },

  data: {
    percent: 0,
    tickPercents: [],
  },

  observers: {
    'value, min, max'(value, min, max) {
      this.setData({ percent: this.toPercent(value) });
    },
    'ticks, min, max'(ticks) {
      this.setData({ tickPercents: (ticks || []).map(tick => this.toPercent(tick)) });
    },
  },

  methods: {
    toPercent(value) {
      const { min, max } = this.data;
      return max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
    },

    // 按步长取整，避免 0.1 之类的浮点误差
    snap(raw) {
      const { min, max, step } = this.data;
      const steps = Math.round((raw - min) / step);
      const value = min + steps * step;
      const decimals = (String(step).split('.')[1] || '').length;
      return Math.max(min, Math.min(max, Number(value.toFixed(decimals))));
    },

    onTouchStart(e) {
      if (this.data.disabled || !e.touches?.length) return;
      const gesture = { clientX: e.touches[0].clientX, active: true };
      this._gesture = gesture;
      this.createSelectorQuery().select('.slider-appearance').boundingClientRect(rect => {
        if (this._gesture !== gesture || !rect?.width) return;
        gesture.rect = rect;
        this.updateFromTouch(gesture, 'changing');
      }).exec();
    },

    onTouchMove(e) {
      const gesture = this._gesture;
      if (!gesture?.active || !e.touches?.length) return;
      gesture.clientX = e.touches[0].clientX;
      this.updateFromTouch(gesture, 'changing');
    },

    onTouchEnd(e) {
      const gesture = this._gesture;
      if (!gesture?.active) return;
      if (e.changedTouches?.length) gesture.clientX = e.changedTouches[0].clientX;
      gesture.active = false;
      this.updateFromTouch(gesture, 'change');
    },

    updateFromTouch(gesture, type) {
      if (this.data.disabled || !gesture.rect) return;
      const { left, width } = gesture.rect;
      const ratio = Math.max(0, Math.min(1, (gesture.clientX - left) / width));
      const value = this.snap(this.data.min + ratio * (this.data.max - this.data.min));
      if (value !== this._lastEmitted || type === 'change') {
        this._lastEmitted = value;
        this.setData({ percent: this.toPercent(value) });
        this.triggerEvent(type, { value });
      }
    },

    // 读屏调节（原生 slider）
    onNativeChange(e) {
      if (this.data.disabled) return;
      const value = this.snap(Number(e.detail.value));
      this.triggerEvent('change', { value });
    },
  },
});
