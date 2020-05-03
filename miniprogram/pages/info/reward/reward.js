// miniprogram/pages/info/reward/reward.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    images: {
      'juankuan': 'cloud://rel-eeeccf.7265-rel-eeeccf/系统/juankuan.jpg',
      'gongzhonghao': 'cloud://rel-eeeccf.7265-rel-eeeccf/系统/gongzhonghao.jpg'
    }
  },

  onLoad: function (option) {
    this.loadReward();
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
    const src = "cloud://rel-eeeccf.7265-rel-eeeccf-1258586139/系统/reward.jpg";
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
  }
})