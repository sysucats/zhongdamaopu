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
      fail: (res) => {
        console.log('[toNewCat] previewImage fail:', res);
        wx.showModal({
          title: '新猫问卷配置中',
          content: '新猫问卷还没配置好，可先通过本页的「信息反馈」把猫猫信息发给我们，管理员会帮忙上户口~',
          showCancel: false,
        });
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