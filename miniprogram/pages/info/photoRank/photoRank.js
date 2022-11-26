import { getPageUserInfo, toSetUserInfo, fillUserInfo } from "../../../user";
import { text as text_cfg } from "../../../config";
const share_text = text_cfg.app_name + ' - ' + text_cfg.photo_rank.share_tip;

// 是否使用微信云，不然使用Laf云
const cloud = require('../../../cloudAccess.js').cloud;
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
  onReady: async function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function () {
    this.getRank();
    await getPageUserInfo(this);
    await this.getMyRank();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  async getUInfo() {
    toSetUserInfo()
  },

  async getRank() {
    const db = cloud.database();
    var rankRes = await db.collection('photo_rank').orderBy('mdate', 'desc').limit(1).get();
    
    if (rankRes.data.length == 0) {
      // 还没有月榜
      return false;
    }
    const rank_stat = rankRes.data[0].stat;
    console.log(rank_stat);
    var ranks = [];
    for (const key in rank_stat) {
      ranks.push({
        _openid: key,
        count: rank_stat[key].count,
        // userInfo: rank_stat[key].userInfo,
      })
    }
    // 填充userInfo
    await fillUserInfo(ranks, "_openid", "userInfo");
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

    await this.setData({
      ranks: ranks
    });

    await this.getMyRank();
  },

  async getMyRank() {
    if (!this.data.user || !this.data.ranks) {
      return false;
    }
    const ranks = this.data.ranks;
  
    const openid = this.data.user.openid;
    console.log(openid, ranks);
    for (const i in ranks) {
      if (ranks[i]._openid === openid) {
        this.setData({
          'user.photo_rank': ranks[i].rank,
          'user.photo_count': ranks[i].count
        });
        return;
      }
    }
  }
})
