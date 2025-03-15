Component({
    properties: {
      show: {
        type: Boolean,
        value: false,
        observer: function(newVal, oldVal) {
          // 当show从true变为false时，不立即隐藏，先放关闭动画
          if (oldVal === true && newVal === false) {
            this._autoHide();
          }
        }
      },
      position: {
        type: String,
        value: 'bottom', // 'bottom' 或 'center'
      },
      zindex: {
        type: Number,
        value: 999999
      }
    },
    data: {
      closing: false,
      internalShow: false // 内部状态，控制实际显示/隐藏
    },
    
    observers: {
      'show': function(show) {
        // 当show为true时，立即设置内部显示状态为true
        if (show) {
          this.setData({
            internalShow: true,
            closing: false
          });
        }
      }
    },
    
    methods: {
      // 外部直接设置show=false时调用，关闭动画
      _autoHide() {
        // 关闭中，不重复操作
        if (this.data.closing) return;
        
        // 先放关闭动画
        this.setData({ closing: true });
        
        // 动画结束后再真正隐藏组件
        if (this._timer) {
          clearTimeout(this._timer);
        }
        
        this._timer = setTimeout(() => {
          this.setData({
            internalShow: false,
            closing: false
          });
          this._timer = null;
        }, 300); // 动画持续时间
      },
      
      // 供外部调用的hide方法，触发close事件
      hide() {
        // 关闭中，不重复操作
        if (this.data.closing) return;
        
        // 先播放关闭动画
        this.setData({ closing: true });
        
        // 动画结束后再触发close事件和真正隐藏组件
        if (this._timer) {
          clearTimeout(this._timer);
        }
        
        this._timer = setTimeout(() => {
          this.setData({
            internalShow: false,
            closing: false
          });
          // 触发close事件，让外部组件可以设置show=false
          this.triggerEvent('close');
          this._timer = null;
        }, 300); // 动画持续时间
      }
    },
    
    detached() {
      // 组件销毁时清理定时器
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    }
  });