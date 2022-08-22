const utils = require('../../../utils.js');
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.randomInt;
const isManager = utils.isManager;
const formatDate = utils.formatDate;

const cloud = require('../../../cloudAccess.js').cloud;

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
    const db = cloud.database();
    db.collection('reward').orderBy('mdate', 'desc').get().then(res => {
      for (var r of res.data) {
        console.log("Reward:", r);
        var mdate = new Date(r.mdate);
        r.mdateStr = mdate.getFullYear() + '年' + (mdate.getMonth() + 1) + '月';
        r.records_raw = r.records;
        r.records = r.records.replace(/^\#+|\#+$/g, '').split('#');
        r.changing = false;
      }
      that.setData({
        rewards: res.data
      });
      console.log("LoadingReward", res.data);
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

    if (reward_to_change._id) { // Update
      cloud.callFunction({
        name: 'curdOp',
        data: {
          permissionLevel: 3,
          operation: "update",
          collection: "reward",
          item_id: reward_to_change._id,
          data: {
            records: reward_to_change.records
          }
        }
      }).then(res => {
        that.loadRewards();
      });
    } else { // Add 新月份
      // TODO 这里有 Bug，上传参数 mdate 实际上是字符串，保存在数据库上也是字符串
      // 而在云函数上创建的 mdate: new Date() 在数据库上虽然显示为字符串但实际上是 Date
      // 导致 cloud orderby 结果出错
      cloud.callFunction({
        name: 'curdOp',
        data: {
          permissionLevel: 3,
          operation: "add",
          collection: "reward",
          data: {
            mdate: new Date(reward_to_change.mdate),
            records: reward_to_change.records
          }
        }
      }).then(res => {
        that.loadRewards();
      });
    }
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