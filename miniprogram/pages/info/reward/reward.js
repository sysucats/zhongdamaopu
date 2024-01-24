// miniprogram/pages/info/reward/reward.js
import { text as text_cfg, reward_img } from "../../../config";
import { checkCanReward } from "../../../utils/user";
import { cloud } from "../../../utils/cloudAccess";
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
    this.loadReward();
    
    // 是否开启
    this.setData({
      canReward: await checkCanReward()
    });

    // 设置广告ID
    const ads = await getGlobalSettings('ads') || {};
    
    // 在页面onLoad回调事件中创建激励视频广告实例
    var that = this;
    if (wx.createRewardedVideoAd) {
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
          toast = text_cfg.reward.ad_success_tip;
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

  async loadReward() {
    const db = await cloud.databaseAsync();
    var rewardRes = await db.collection('reward').orderBy('mdate', 'desc').get();
    
    console.log(rewardRes.data);
    for (var r of rewardRes.data) {
      const tmp = r.recordDate ? new Date(r.recordDate) : new Date(r.mdate);
      r.mdate = tmp.getFullYear() + '年' + (tmp.getMonth()+1) + '月';
      r.records = r.records.replace(/^\#+|\#+$/g, '').split('#');
    }
    this.setData({
      reward: rewardRes.data
    });
  },

  // 打开大图
  async openImg(e) {
    const src = await cloud.signCosUrl(reward_img);
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

  // 跳转到 给赞 小程序
  openMina(e) {
    const appid = e.currentTarget.dataset.appid;
    const path = e.currentTarget.dataset.path;
    wx.navigateToMiniProgram({
      appId: appid,
      path: path,
    });
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