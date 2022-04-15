// miniprogram/pages/info/info.js
const utils = require('../../utils.js');
const config = require('../../config.js');

// console.log("utils:", utils);
const isManager = utils.isManager;

const text_cfg = config.text;
const share_text = text_cfg.app_name + ' - ' + text_cfg.info.share_tip;

Page({
  data: {
    friendApps: [],
    showManager: false,
    numChkPhotos: 0,
    numFeedbacks: 0,
    numImProcess: 0,
    friendLinkImgLoaded:false,
    text_cfg: text_cfg,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const that = this;
    const db = wx.cloud.database();
    db.collection('setting').doc('friendLink').get().then(res => {
      // that.friendApps = res.data.apps;
      that.setData({
        friendApps: res.data.apps,
      })
    });
  },

  // 用 onShow 不用 onLoad，为了在返回这个页面时也能重新加载
  onShow: function (options) {
    isManager(res => {
      if (res) {
        const that = this;
        const db = wx.cloud.database();
        const _ = db.command;
        db.collection('photo').where({ verified: false}).count().then(res => {
          that.data.numChkPhotos = res.total;
          that.setData({
            numChkPhotos: res.total,
          })
        })
        db.collection('feedback').where({ dealed: false}).count().then(res => {
          that.data.numFeedbacks = res.total;
          that.setData({
            numFeedbacks: res.total,
          })
        })
        const qf = { photo_compressed: _.in([undefined, '']), verified: true, photo_id: /^((?!\.heic$).)*$/i };
        db.collection('photo').where(qf).count().then(res => {
          that.data.numImProcess = res.total;
          that.setData({
            numImProcess: res.total,
          })
        })
        that.setData({
          showManager: true,
        });
      }
    });

    // 获取version
    const app = getApp();
    this.setData({
      version: app.globalData.version
    });

    // this.setData = this.setData.bind(this);
    // if (options.scene === 1154) {
      // const db = wx.cloud.database();
      // db.collection('setting').doc('pages').get().then(res => {
      // });
    // } 
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  onShareTimeline:function () {
    return {
      title: share_text,
    }
  },

  clickbtn(e) {
    const to = e.currentTarget.dataset.to;
    if (!to) {
      return false;
    }
    wx.navigateTo({
      url: to,
    });
  },

  clickFriendLink(e) {
    const appid = e.currentTarget.dataset.appid;
    wx.navigateToMiniProgram({
      appId: appid
    })
  },

  showMpCode(e) {
    wx.previewImage({
      urls: [config.mpcode_img],
      fail: function(e) {
        console.error(e)
      }
    })
  }
})