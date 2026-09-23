// miniprogram/pages/info/reward/reward.js
// PATCH: 20260918-投喂页去收款码 —— 移除赞赏码与捐款记录，仅保留激励广告
import { text as text_cfg } from "../../../config";
import { getGlobalSettings } from "../../../utils/page";
const share_text = text_cfg.app_name + ' - ' + text_cfg.reward.share_tip;
Page({

  /**
   * 页面的初始数据
   */
  data: {
    showAdBlock: false,
    text_cfg: text_cfg,
  },

  jsData: {
    // 在页面中定义激励视频广告
    videoAd: null,
  },

  onLoad: async function (option) {
    // 设置广告ID
    const ads = await getGlobalSettings('ads') || {};
    // 在页面onLoad回调事件中创建激励视频广告实例
    var that = this;
    // 未配置广告位ID时不创建广告实例（否则会报错）
    if (ads.reward_video && wx.createRewardedVideoAd) {
      this.jsData.videoAd = wx.createRewardedVideoAd({
        adUnitId: ads.reward_video
      })
      this.jsData.videoAd.onLoad(() => {
        that.setData({
          showAdBlock: true
        });
      })
      this.jsData.videoAd.onError((err) => {
        that.setData({
          showAdBlock: false
        });
      })
      this.jsData.videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        var toast = text_cfg.reward.ad_success_tip;
        var icon = 'success';
        if (res && res.isEnded) {
          // 正常播放结束
        } else {
          // 播放中途退出
          toast = text_cfg.reward.ad_fail_tip;
          icon = 'error';
        }
        wx.showToast({
          title: toast,
          icon: icon,
        });
      })
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  // 激励广告
  openAd() {
    // 用户触发广告后，显示激励视频广告
    if (this.jsData.videoAd) {
      this.jsData.videoAd.show().catch(() => {
        // 失败重试
        this.jsData.videoAd.load()
          .then(() => this.jsData.videoAd.show())
          .catch(err => {
            console.log('激励视频 广告显示失败')
          })
      })
    }
  }
})
