const utils = require('../../../utils.js');
const generateUUID = utils.generateUUID;
const getCurrentPath = utils.getCurrentPath;
const shareTo = utils.shareTo;
const getGlobalSettings = utils.getGlobalSettings;

const user = require('../../../user.js');
const getUserInfoOrFalse = user.getUserInfoOrFalse;
const toggleUserNoticeSetting = user.toggleUserNoticeSetting;

const msg = require('../../../msg.js');
const requestNotice = msg.requestNotice;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    user: {},
    length: 0,
    maxlength: 300,
    cat: undefined
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const db = wx.cloud.database();
    if (options.cat_id != undefined) {
      db.collection('cat').doc(options.cat_id).field({ name: true, _id: true }).get().then(res => {
        console.log(res.data);
        this.data.cat = res.data;
        this.setData({
          cat: this.data.cat
        });
      })
    }
    //this.checkUInfo();
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

  getUInfo() {
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

  bindInput(e) {
    var inputData = e.detail.value;
    this.setData({
      length: inputData.length
    })
  },

  async bindSubmit(e) {
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
    // let repliable = await requestNotice('feedback'); // 请求订阅消息推送
    wx.showLoading({
      title: '正在提交...',
      mask: true,
    })
    var data = {
      userInfo: this.data.user.userInfo,
      openDate: new Date(),
      feedbackInfo: submitData.feedbackInfo,
      contactInfo: submitData.contactInfo,
      dealed: false,
      // repliable: repliable,
    };
    if (this.data.cat != undefined) {
      data.cat_id = this.data.cat._id;
      data.cat_name = this.data.cat_name;
    }
    const that = this;
    const db = wx.cloud.database();
    db.collection('feedback').add({
      data: data,
      success: (res) => {
        console.log(res);
        that.setData({
          feedbackId : res._id
        })
        wx.hideLoading();
        wx.showToast({
          title: '收到你的反馈啦',
          icon: 'success',
          duration: 1000,
          success: () => {
            // setTimeout(() => {
            //   wx.navigateBack();
            // }, 1000)
          }
        })
      },
      fail: console.error
    })
  },
  
  async toSubmit() {
    let repliable = await requestNotice('feedback'); // 请求订阅消息推送
    const db = wx.cloud.database();
    db.collection('feedback').doc(this.data.feedbackId).update({
      data:{
        repliable:repliable
      },
      success:res=>{
          wx.navigateBack();
      }
    })
}
})

