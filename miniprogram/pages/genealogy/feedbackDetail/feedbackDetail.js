const utils = require('../../../utils.js');
const generateUUID = utils.generateUUID;
const getCurrentPath = utils.getCurrentPath;
const shareTo = utils.shareTo;
const getGlobalSettings = utils.getGlobalSettings;

const user = require('../../../user.js');
const getUserInfoOrFalse = user.getUserInfoOrFalse;
const toggleUserNoticeSetting = user.toggleUserNoticeSetting;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    user: {},
    length: 0,
    maxlength: 300,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const db = wx.cloud.database();
    const cat = db.collection('cat');
    const cat_id = options.cat_id;
    cat.doc(cat_id).field({ name: true, _id: true}).get().then(res => {
      console.log(res.data);
      this.setData({
        cat: res.data
      });
    })
    this.checkUInfo();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    console.log(shareTo(this.data.cat.name + ' - 中大猫谱', path))
    return shareTo('来给' + this.data.cat.name + '反馈信息 - 中大猫谱', path);
  },

  checkUInfo() {
    const that = this;
    // 检查用户信息有没有拿到，如果有就更新this.data
    getUserInfoOrFalse().then(res => {
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

  getUInfo(event) {
    console.log(event);
    this.checkUInfo();
  },

  bindInput(e) {
    var inputData = e.detail.value;
    this.setData({
      length: inputData.length
    })
  },

  bindSubmit(e) {
    var submitData = e.detail.value;
    if (!submitData.feedbackInfo) {
      wx.showToast({
        title: '请填写信息后再提交哦',
        icon: 'none'
      })
      return;
    } /* else if (!submitData.contactInfo) {
      wx.showToast({
        title: '留个联系方式叭',
        icon: 'none'
      })
      return;
    } */
    const cat = this.data.cat;
    const that = this;
    const db = wx.cloud.database();
    db.collection('feedback').add({
      data: {
        cat_id: cat._id,
        cat_name: cat.name,
        userInfo: that.data.user.userInfo,
        openDate: new Date(),
        feedbackInfo: submitData.feedbackInfo,
        contactInfo: submitData.contactInfo,
        dealed: false
      },
      success: (res) => {
        console.log(res);
        wx.showToast({
          title: '收到你的反馈啦',
          icon: 'success',
          duration: 1000,
          success: () => {
            setTimeout(() => {
              wx.navigateBack();
            }, 1000)
          }
        })
      },
      fail: console.error
    })
  }
})