import { text as text_cfg, feedback_wj_img } from "../../../config";
const share_text = text_cfg.app_name + ' - ' + text_cfg.feedback.share_tip;
import { signCosUrl } from "../../../utils/common";
Page({

  /**
   * 页面的初始数据
   */
  data: {
    text_cfg: text_cfg,
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

  async toNewCat() {
    const src = await signCosUrl(feedback_wj_img);
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
      title: share_text
    }
  }
})