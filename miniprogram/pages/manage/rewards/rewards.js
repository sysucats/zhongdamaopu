import { formatDate } from "../../../utils/utils";
import { checkAuth } from "../../../utils/user";
import api from "../../../utils/cloudApi";

const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    rewards: [],
    adding: false,
    today: formatDate(new Date(), "yyyy-MM"),
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await checkAuth(this, 3)) {
      await this.loadRewards();
    }
  },

  async loadRewards() {
    wx.showLoading({
      title: '加载投喂记录中',
    })
    var { result } = await app.mpServerless.db.collection('reward').find({}, { sort: { mdate: -1, recordDate: -1 } });
    for (var r of result) {
      r.mdate = r.recordDate ? new Date(r.recordDate) : new Date(r.mdate);
      r.mdateStr = r.mdate.getFullYear() + '年' + (r.mdate.getMonth() + 1) + '月';
      r.records_raw = r.records;
      r.records = r.records.replace(/^\#+|\#+$/g, '').split('#');
      r.changing = false;
    }
    this.setData({
      rewards: result
    });
    wx.hideLoading();
  },

  clickChange(e) {
    var rewards = this.data.rewards;
    const index = e.currentTarget.dataset.index;
    rewards[index].changing = true;
    this.setData({
      rewards: rewards
    })
  },

  async changeConfirm(e) {
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
      mdate: new Date(rewards[index].mdate),
      records: records_raw,
    }
    const that = this;

    if (reward_to_change._id) { // Update
      await api.curdOp({
        operation: "update",
        collection: "reward",
        item_id: reward_to_change._id,
        data: {
          recordDate: reward_to_change.mdate,
          records: reward_to_change.records
        }
      });
      that.loadRewards();
    } else { // Add 新月份
      await api.curdOp({
        operation: "add",
        collection: "reward",
        data: {
          recordDate: reward_to_change.mdate,
          records: reward_to_change.records
        }
      });
      that.loadRewards();
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
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  }
})