// 处理反馈
const utils = require('../../../utils.js');
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.regeneratorRuntime;
const isManager = utils.isManager;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    total: '-',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkAuth();
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 检查权限
  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.reload();
      } else {
        that.setData({
          tipText: '只有管理员Level-1能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 1)
  },

  async loadFeedbacks() {
    const db = wx.cloud.database();
    var feedbacks = (await db.collection('feedback').where({ dealed: false }).get()).data;
    for (var fb of feedbacks) {
      var cat = (await db.collection('cat').doc(fb.cat_id).get()).data;
      fb.cat = cat
    }
    console.log(feedbacks);
    // 将Date对象转化为字符串
    for (let i = 0; i < feedbacks.length; ++i) {
      feedbacks[i].openDateStr = utils.formatDate(feedbacks[i].openDate, "yyyy-MM-dd hh:mm:ss");
    }
    this.setData({
      feedbacks: feedbacks
    });
    return true;
  },

  reload() {
    wx.showLoading({
      title: '加载中...',
    });
    const that = this;
    const db = wx.cloud.database();
    db.collection('feedback').where({ dealed: false }).count().then(res => {
      console.log(res);
      that.setData({
        total: res.total
      });
      that.loadFeedbacks().then(() => {
        wx.hideLoading();
      });
    });
  },

  bindCheck(e) {
    const feedback = e.currentTarget.dataset.feedback;
    const that = this;
    wx.showModal({
      title: '提示',
      content: '确定已完成该反馈处理？',
      success(res) {
        if (res.confirm) {
          console.log('确认反馈处理');
          wx.cloud.callFunction({
            name: "manageFeedback",
            data: {
              feedback: feedback
            }
          }).then(res => {
            console.log("反馈已处理：" + feedback._id);
            console.log(res.data);
            // 直接从列表里去掉这个反馈，不完全加载了
            const feedbacks = that.data.feedbacks;
            const new_feedbacks = feedbacks.filter((fb, index, arr) => {
              // 这个feedback是用户点击的feedback，在上面定义的
              return fb._id != feedback._id;
            });
            that.setData({
              feedbacks: new_feedbacks,
              total: that.data.total - 1
            }, () => {
              wx.showToast({
                title: '反馈已处理',
              });
            });
          })
        }
      }
    })
  },

  bindCopy(e) {
    const item = e.currentTarget.dataset.feedback;
    const mdate = new Date(item.date_str);
    const dateStr = mdate.getFullYear() + '-' + (mdate.getMonth() + 1) + '-' + mdate.getDate() + ' ' + mdate.getHours() + ':' + mdate.getMinutes() + ':' + mdate.getSeconds()
    wx.setClipboardData({
      data: "所属猫猫：" + item.cat.name + '（' + item.cat.campus + '）' + "\n反馈内容：" + item.feedbackInfo + "\n反馈人：" + item.userInfo.nickName + "\n联系方式：" + (item.contactInfo || "对方没有留下联系方式") + "\n反馈时间：" + dateStr,
    });
  },

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },

  toReply(e) {
    const fb_id = e.currentTarget.dataset.fbid;
    wx.navigateTo({
      url: '/pages/manage/replyFeedback/replyFeedback?fb_id=' + fb_id,
    })
  }
})