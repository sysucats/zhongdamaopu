// miniprogram/pages/info/feedback/feedback.js
Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  toFeedback() {
    wx.navigateTo({
      url: '/pages/genealogy/feedbackDetail/feedbackDetail',
    })
  },

  toNewCat() {
    const src = "cloud://rel-eeeccf.7265-rel-eeeccf-1258586139/系统/新猫问卷.png";
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