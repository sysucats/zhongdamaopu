// pages/manage/manageNews/newAnnounce/newAnnounce.js
const utils = require('../../../utils.js');
const user = require('../../../user.js');
const isManager = utils.isManager;

const getCurUserInfoOrFalse = user.getCurUserInfoOrFalse;

Page({
  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    auth: false,
    user: {},
    titlelength: 0,
    titlemaxlength: 30,
    length: 0,
    maxlength: 800
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
      }
    }, 2)
  },

  bindInputTitle(e) {
    var inputData = e.detail.value;
    this.setData({
      titlelength: inputData.length
    })
  },

  bindInput(e) {
    var inputData = e.detail.value;
    this.setData({
      length: inputData.length
    })
  },

  getUInfo() {
    const that = this;
    getCurUserInfoOrFalse().then(res => {
      if (!res) {
        console.log('未授权');
        return;
      }
      console.log(res);
      that.setData({
        isAuth: true,
        user: res,
      });
    });
  },

  async bindSubmit(e) {
    var submitData = e.detail.value;
    console.log(submitData);
    if (!submitData.title) {
      wx.showToast({
        title: '请填写标题后再发布哦',
        icon: 'none'
      })
      return;
    }

    var data = {
      userInfo: this.data.user.userInfo,
      date: new Date(),
      ddate: new Date().toLocaleString(),
      title: submitData.title,
      mainContent: submitData.mainContent,
    }

    const db = wx.cloud.database();
    db.collection('news').add({
      data: data,
      success: (res) => {
        console.log(res);
        wx.showToast({
          title: '发布成功',
          icon: 'success',
          duration: 1000
        })
        setTimeout(wx.navigateBack, 1000)
      },
      fail: console.error
    })
  }
})