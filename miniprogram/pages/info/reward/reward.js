// miniprogram/pages/info/reward/reward.js
import { text as text_cfg, reward_img } from "../../../config";
import { checkCanReward } from "../../../utils/user";
import { getGlobalSettings } from "../../../utils/page";
import { signCosUrl } from "../../../utils/common";
const share_text = text_cfg.app_name + ' - ' + text_cfg.reward.share_tip;
const app = getApp();

// 仅按月份和现有分隔符展示，不解释自由文本内容。
function buildRewardMonth(record) {
  const date = new Date(record.recordDate || record.mdate);
  const timestamp = Number.isNaN(date.getTime()) ? 0 : date.getTime();
  const monthLabel = timestamp ? `${date.getFullYear()}年${date.getMonth() + 1}月` : '未标注月份';
  const paragraphs = (Array.isArray(record.records) ? record.records : String(record.records || '').split('#'))
    .map((text, key) => ({ key, text: String(text) }))
    .filter(paragraph => paragraph.text.trim());
  return { ...record, monthLabel, timestamp, paragraphs, expanded: false };
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    showAdBlock: false,
    text_cfg: text_cfg,
    reward: [],
    rewardLoading: true,
    rewardLoadError: '',
    canReward: false,
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
    this.setData({ rewardLoading: true, rewardLoadError: '' });
    try {
      const { result: rewardRes } = await app.mpServerless.db.collection('reward').find({}, { sort: { mdate: -1 } });
      const reward = rewardRes.map(buildRewardMonth).sort((a, b) => b.timestamp - a.timestamp);
      if (reward.length) reward[0].expanded = true;
      this.setData({ reward });
    } catch (error) {
      console.error('加载投喂记录失败', error);
      this.setData({ rewardLoadError: '投喂记录加载失败，请重试。' });
    } finally {
      this.setData({ rewardLoading: false });
    }
  },

  toggleMonth(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.reward[index]) return;
    this.setData({ [`reward[${index}].expanded`]: !this.data.reward[index].expanded });
  },

  // 打开大图
  async openImg(e) {
    const src = await signCosUrl(reward_img);
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
