Component({
  /**
   * 组件的属性列表
   */
  properties: {
    tipText: {
      type: String,
      value: '正在鉴权...'
    },
    tipBtn: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
  },

  /**
   * 组件的方法列表
   */
  methods: {
    goBack() {
      wx.navigateBack();
    }
  }
}) 