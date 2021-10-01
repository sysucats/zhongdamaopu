const utils = require('../../../utils.js');
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.randomInt;
const isManager = utils.isManager;
const formatDate = utils.formatDate;
Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    rewards: [],
    adding: false,
    today: formatDate(new Date(), "yyyy-MM"),
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkAuth();
  },

  // 检查权限
  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.loadRewards();
      } else {
        that.setData({
          tipText: '只有管理员Level-3才能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 3);
  },

  loadRewards() {
    wx.showLoading({
      title: '加载打赏记录中',
    })
    const that = this;
    const db = wx.cloud.database();
    db.collection('reward').orderBy('mdate', 'desc').get().then(res => {
      for (var r of res.data) {
        r.mdateStr = r.mdate.getFullYear() + '年' + (r.mdate.getMonth() + 1) + '月';
        r.records_raw = r.records;
        r.records = r.records.replace(/^\#+|\#+$/g, '').split('#');
        r.changing = false;
      }
      that.setData({
        rewards: res.data
      });
      console.log(res.data);
      wx.hideLoading();
    });
  },

  clickChange(e) {
    var rewards = this.data.rewards;
    const index = e.currentTarget.dataset.index;
    rewards[index].changing = true;
    this.setData({
      rewards: rewards
    })
  },

  changeConfirm(e) {
    wx.showLoading({
      title: '正在提交',
      mask: true
    });
    console.log(e);
    var rewards = this.data.rewards;
    const index = e.currentTarget.dataset.index;
    const records_raw = e.detail.value.records_raw;
    console.log(rewards[index]);
    var reward_to_change = {
      _id: rewards[index]._id,
      mdate: rewards[index].mdate,
      records: records_raw,
    }
    const that = this;
    wx.cloud.callFunction({
      name: 'updateReward',
      data: {
        reward_to_change: reward_to_change
      }
    }).then(res => {
      that.loadRewards();
    });
  },

  addMonth(e) {
    var rewards = this.data.rewards;
    rewards.unshift({})
    this.setData({
      adding: true,
      rewards: rewards,
    });
  },

  addMonthConfirm(e) {
    var rewards = this.data.rewards;
    const value = e.detail.value;
    var date = new Date(value);
    var new_reward = rewards[0];
    new_reward.mdate = date;
    new_reward.mdateStr = date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
    for (let i = 1, len = rewards.length; i < len; ++i) {
      const r = rewards[i];
      if (r.mdateStr == new_reward.mdateStr) {
        wx.showToast({
          title: '已有这个月份',
          icon: 'none'
        })
        return false;
      }
    }
    new_reward.changing = true;
    new_reward.raw_records = '';
    this.setData({
      rewards: rewards
    })
  }

})