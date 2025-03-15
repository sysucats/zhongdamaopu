Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (newVal) {
          this.setData({ show: true });
        } else {
          this.setData({ show: false });
        }
      }
    },
    zindex: {
      type: Number
    },
  },
  methods: {
    hide: function() {
      this.setData({ show: false });
      this.triggerEvent('close');
    },
    catchTouchMove: function() {
      // 阻止滑动穿透，不执行任何操作，仅捕获事件
      return false;
    }
  }
});