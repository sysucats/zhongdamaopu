// miniprogram/pages/info/info.js
const utils = require('../../utils.js');

console.log("utils:", utils);
const isManager = utils.isManager;

const rewardsStep = 20;
var rewardsMax = 0;
Page({

  /**
   * 页面的初始数据
   */
  data: {
    showManager: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const that = this;
    isManager(res => {
      if (res) {
        that.setData({
          showManager: true
        });
      }
    });

    // 获取version
    const app = getApp();
    this.setData({
      version: app.globalData.version
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '关于 - 中大猫谱'
    }
  },

  clickbtn(e) {
    const to = e.currentTarget.dataset.to;
    if (!to) {
      wx.showToast({
        title: 'Nothing...',
      });
      return false;
    }
    wx.navigateTo({
      url: to,
    });
  },

  longtapbtn(e) {
    const to = e.currentTarget.dataset.longto;
    if (!to) {
      wx.showToast({
        title: 'Nothing...',
      });
      return false;
    }
    wx.navigateTo({
      url: to,
    });
  }
})