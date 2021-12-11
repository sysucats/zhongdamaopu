// miniprogram/pages/info/reward/reward.ts
import { checkCanUpload } from '../../../utils'
import config from '../../../config'

// 在页面中定义激励视频广告
let videoAd = null

Page({

  /**
   * 页面的初始数据
   */
  data: {
    showAdBlock: false,
  },

  onLoad: function (option) {
    this.loadReward();
    var that = this;
    
    // 是否开启
    checkCanUpload().then(res => {
      that.setData({
        canUpload: res
      });
    })
    
    // 在页面onLoad回调事件中创建激励视频广告实例
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-eac4513e7b770f93'
      })
      videoAd.onLoad(() => {
        that.setData({
          showAdBlock: true
        });
      })
      videoAd.onError((err) => {
        that.setData({
          showAdBlock: false
        });
      })
      videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        var toast = "多谢喵(ฅ'ω'ฅ)!";
        var icon = 'success';
        if (res && res.isEnded) {
          // 正常播放结束
        } else {
          // 播放中途退出
          toast = "没播完喵...";
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
      title: '打赏罐头 - 中大猫谱'
    }
  },

  loadReward() {
    const that = this;
    const db = wx.cloud.database();
    db.collection('reward').orderBy('mdate', 'desc').get().then(res => {
      console.log(res.data);
      for (var r of res.data) {
        const tmp = r.mdate;
        r.mdate = tmp.getFullYear() + '年' + (tmp.getMonth()+1) + '月';
        r.records = r.records.replace(/^\#+|\#+$/g, '').split('#');
      }
      that.setData({
        reward: res.data
      });
    });
  },

  // 打开大图
  openImg(e) {
    const src = config.reward_img;
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
    if (videoAd) {
      videoAd.show().catch(() => {
        // 失败重试
        videoAd.load()
          .then(() => videoAd.show())
          .catch(err => {
            console.log('激励视频 广告显示失败')
          })
      })
    }
  }
})