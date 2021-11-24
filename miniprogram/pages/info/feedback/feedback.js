// miniprogram/pages/info/feedback/feedback.js
const config = require('../../../config.js');

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  toMyFeedback() {
    wx.navigateTo({
      url: '/pages/info/feedback/myFeedback/myFeedback'
    });
  },

  toFeedback() {
    wx.navigateTo({
      url: '/pages/genealogy/feedbackDetail/feedbackDetail',
    })
  },

  toNewCat() {
    const src = config.feedback_wj_img;
    wx.previewImage({
      urls: [src],
      success: (res) => {
        console.log(res);
      },
      fail: (res) => {
        console.log(res);
      },
      complete: (res) => {
        console.log(res);
      },
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '信息反馈 - 中大猫谱'
    }
  }
})