// 处理反馈
const utils = require('../../../utils.js');
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.regeneratorRuntime;
const isManager = utils.isManager;
const formatDate = utils.formatDate;

const msg = require('../../../msg.js');
const sendReplyNotice = msg.sendReplyNotice;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    feedback: undefined,
    maxlength: 300,
    length: 0,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkAuth(options);
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 检查权限
  checkAuth(options) {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.reload(options);
      } else {
        that.setData({
          tipText: '只有管理员Level-1能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 1)
  },

  reload(options) {
    wx.showLoading({
      title: '加载中...',
    });
    const that = this;
    const db = wx.cloud.database();
    db.collection('feedback').doc(options.fb_id).get().then(res => {
      console.log(res);
      res.data.openDateStr = formatDate(res.data.openDate, "yyyy-MM-dd hh:mm:ss");
      that.data.feedback = res.data;
      that.setData({
        feedback: this.data.feedback
      }, wx.hideLoading);
    });
  },

  bindInput(e) {
    var inputData = e.detail.value;
    this.setData({
      length: inputData.length
    })
  },

  async bindReply(e) {
    var submitData = e.detail.value;
    if (!submitData.replyInfo) {
      wx.showToast({
        title: '请填写回复后再提交哦',
        icon: 'none'
      })
      return;
    }
    const that = this;
    wx.showModal({
      title: '提示',
      content: '由于微信限制，每条反馈最多只能回复1次，确定回复吗？',
      async success(res) {
        if (res.confirm) {
          console.log('确认提交回复');
          wx.showLoading({
            title: '正在提交...',
            mask: true
          });
          let res = await sendReplyNotice(that.data.feedback._openid, that.data.feedback._id);
          console.log(res);
          if (res.errCode == 0) {
            // 记录一下回复的内容和时间
            await wx.cloud.callFunction({
              name: "manageFeedback",
              data: {
                operation: 'reply',
                feedback: that.data.feedback,
                replyInfo: submitData.replyInfo,
              }
            });
            wx.hideLoading();
            wx.showToast({
              title: '回复成功',
              icon: 'success',
              duration: 1000,
              success: () => {
                setTimeout(wx.navigateBack, 1000)
              }
            })
          } else {
            wx.hideLoading();
            wx.showToast({
              title: '回复失败，这可能是因为对方没有订阅或次数耗尽',
              icon: 'none',
              duration: 1500,
              success: () => {
                setTimeout(wx.navigateBack, 1500)
              }
            });
          }
        }
      }
    });
  }

})