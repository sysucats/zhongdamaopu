// miniprogram/pages/info/photoRank/photoRank.js
const user = require('../../../user.js');
const getCurUserInfoOrFalse = user.getCurUserInfoOrFalse;

const config = require('../../../config.js');
const text_cfg = config.text;
const share_text = text_cfg.app_name + ' - ' + text_cfg.photo_rank.share_tip;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    text_cfg: text_cfg,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    //this.checkUInfo();
    this.getRank();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  getUInfo() {
    const that = this;
    // 检查用户信息有没有拿到，如果有就更新this.data
    getCurUserInfoOrFalse().then(res => {
      if (!res) {
        console.log('未授权');
        return;
      }
      console.log(res);
      that.setData({
        userInfo: res.userInfo,
      }, () => { that.getMyRank() })
    });
  },
  getRank(event) {
    const that = this;
    const db = wx.cloud.database();
    db.collection('photo_rank').orderBy('mdate', 'desc').limit(1).get().then(res => {
      if (res.data.length == 0) {
        // 还没有月榜
        return false;
      }
      const rank_stat = res.data[0].stat;
      console.log(rank_stat);
      var ranks = [];
      for (const key in rank_stat) {
        ranks.push({
          _openid: key,
          count: rank_stat[key].count,
          userInfo: rank_stat[key].userInfo,
        })
      }
      ranks.sort((a, b) => {
        return parseInt(b.count) - parseInt(a.count)
      });
      console.log(ranks);
      for (var i = 0; i < ranks.length; i++) {
        ranks[i].rank = i+1;
      }
      for (var i = 1; i<ranks.length; i++) {
        if (ranks[i].count == ranks[i-1].count) {
          ranks[i].rank = ranks[i - 1].rank;
        }
      }
      that.setData({
        ranks: ranks
      }, () => { that.getMyRank() })
    });
  },

  getMyRank() {
    if (!this.data.userInfo || !this.data.ranks) {
      return false;
    }
    const that = this;
    const ranks = this.data.ranks;
    wx.cloud.callFunction({
      name: 'login',
      complete: (res) => {
        console.log(res);
        const openid = res.result.openid;
        console.log(ranks);
        for (const i in ranks) {
          if (ranks[i]._openid === openid) {
            that.setData({
              'userInfo.photo_rank': ranks[i].rank,
              'userInfo.photo_count': ranks[i].count
            });
            return;
          }
        }
      }
    })
    
  }
})