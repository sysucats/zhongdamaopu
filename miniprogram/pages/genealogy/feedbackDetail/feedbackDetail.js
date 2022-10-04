const utils = require('../../../utils.js');
const getCurrentPath = utils.getCurrentPath;
const shareTo = utils.shareTo;

const user = require('../../../user.js');
const getPageUserInfo = user.getPageUserInfo;

const msg = require('../../../msg.js');
const requestNotice = msg.requestNotice;
const sendNotifyChkFeeedback = msg.sendNotifyChkFeeedback;

const text_cfg = require('../../../config.js').text;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    user: {},
    length: 0,
    maxlength: 300,
    cat: undefined,
    text_cfg: text_cfg
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    const db = wx.cloud.database();
    if (options.cat_id != undefined) {
      const catRes = await db.collection('cat').doc(options.cat_id).field({ name: true, _id: true }).get();
      this.setData({
        cat: catRes.data
      });
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    
    const share_text = `来给${this.data.cat.name}反馈信息 - ${text_cfg.app_name}`;
    return shareTo(share_text, path);
  },

  getUInfo() {
    getPageUserInfo(page);
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
    const db = wx.cloud.database();
    const addRes = await db.collection('feedback').add({
      data: data
    });

    await sendNotifyChkFeeedback();
    this.setData({
      feedbackId : addRes._id
    })
    wx.hideLoading();
    wx.showToast({
      title: '收到你的反馈啦',
      icon: 'success',
      duration: 1000
    })
  },
  
  async toSubmit() {
    let repliable = await requestNotice('feedback'); // 请求订阅消息推送

    const db = wx.cloud.database();
    // console.log('fbID:',this.data.feedbackId,'\n repliable:',repliable);
    db.collection('feedback').doc(this.data.feedbackId).update({
      data:{
        repliable:repliable
      },
      success:res=>{
        wx.navigateBack();
      },
      fail:res=>{
        console.log('repliable record fail:\n',res);
      }
    })
  }
})

