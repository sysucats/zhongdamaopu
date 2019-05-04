// miniprogram/pages/science/science.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 几张背景图
    images: [
      "cloud://rel-eeeccf.7265-rel-eeeccf/系统/1.png",
      "cloud://rel-eeeccf.7265-rel-eeeccf/系统/2.png",
      "cloud://rel-eeeccf.7265-rel-eeeccf/系统/3.png",
      "cloud://rel-eeeccf.7265-rel-eeeccf/系统/4.png",
      "cloud://rel-eeeccf.7265-rel-eeeccf/系统/5.png"
    ]
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '科普 - 中大猫谱'
    }
  },

  activate(e) {
    const index = e.currentTarget.dataset.index;
    const old_active = this.data.active;
    const setAct = (index == old_active)? -1: index;
    this.setData({
      active: setAct,
    });
  },

  gotoDetail(e) {
    const cate = e.currentTarget.dataset.cate;
    wx.navigateTo({
      url: '/pages/science/sciDetail/sciDetail?cate=' + cate,
    });
  }
})