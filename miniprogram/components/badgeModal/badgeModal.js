// components/badgeModal/badgeModal.ts
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    zindex: {
      type: Number,
      value: 2,
    },
    title: {
      type: String,
      value: "徽章弹窗标题",
    },
    img: {
      type: String,
      value: "",
    },
    name: {
      type: String,
      value: "徽章名",
    },
    level: {
      type: String,
      value: "",
    },
    desc: {
      type: String,
      value: "徽章描述徽章描述",
    },
    tip: {
      type: String,
      value: "弹窗底部提示",
    },
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
    hide() {
      this.setData({
        show: false,
      });
      this.triggerEvent('close');
    },
  }
})
