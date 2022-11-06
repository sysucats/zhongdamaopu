import { formatDate } from "../../../../utils";
import { getUser } from "../../../../user";
import { cloud } from "../../../../cloudAccess";

var currentUser;

const step = 6;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    login: false,
    feedbacks: [],
    total: 0,
  },

  onLoad: async function() {
    currentUser = await getUser();
    console.log(currentUser);
    if (!currentUser) {
      return;
    }
    this.setData({
      login: true
    });
    this.reload();
  },

  async reload() {
    wx.showLoading({
      title: '加载中...',
    });
    const that = this;
    const db = cloud.database();
    const countRes = await db.collection('feedback').where({
      _openid: currentUser.openid
    }).count();
    that.setData({
      total: countRes.total,
    });
    // 清空，loadFeedbacks再填充
    this.data.feedbacks = [];
    await this.loadFeedbacks();
    wx.hideLoading();
  },

  async loadFeedbacks() {
    const db = cloud.database();
    const nowLoaded = this.data.feedbacks.length;
    var feedbacks = (await db.collection('feedback').where({
      _openid: currentUser.openid
    }).orderBy('openDate', 'desc').skip(nowLoaded).limit(step).get()).data;
    console.log(feedbacks);
    // 获取对应猫猫信息；将Date对象转化为字符串；判断是否已回复
    for (let i = 0; i < feedbacks.length; ++i) {
      if (feedbacks[i].cat_id != undefined) {
        feedbacks[i].cat = (await db.collection('cat').doc(feedbacks[i].cat_id).field({
          name: true,
          campus: true
        }).get()).data;
      }
      feedbacks[i].openDateStr = formatDate(feedbacks[i].openDate, "yyyy-MM-dd hh:mm:ss");
      feedbacks[i].replied = feedbacks[i].hasOwnProperty('replyDate');
      if (feedbacks[i].replied) {
        feedbacks[i].replyDateStr = formatDate(feedbacks[i].replyDate, "yyyy-MM-dd hh:mm:ss");
      }
    }
    this.data.feedbacks.push(...feedbacks);
    this.setData({
      feedbacks: this.data.feedbacks
    });
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: async function () {
    if (this.data.feedbacks.length == this.data.total) {
      wx.showToast({
        title: '已无更多反馈',
        icon: 'none',
        duration: 500
      });
      return;
    }
    wx.showLoading({
      title: '加载更多反馈..',
      mask: true
    });
    await this.loadFeedbacks();
    wx.hideLoading();
  },

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
    url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },
})