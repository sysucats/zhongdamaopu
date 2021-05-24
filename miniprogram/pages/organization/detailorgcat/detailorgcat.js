// miniprogram/pages/organization/detailorgcat/detailorgcat.js
const utils = require('../../../utils.js');
const shareTo = utils.shareTo;
const getCurrentPath = utils.getCurrentPath;
const getGlobalSettings = utils.getGlobalSettings;
const checkCanUpload = utils.checkCanUpload;
const checkMultiClick = utils.checkMultiClick;


// 页面设置，从global读取
var page_settings = {};
var photoMax = 0;
var albumMax = 0;
var cat_id;

var heights = {}; // 系统的各种heights

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    cat_id = options.cat_id;
    this.loadCat();
    
    // 先判断一下这个用户在12小时之内有没有点击过这只猫
    if (!checkMultiClick(cat_id)) {
      console.log("add click!");
      wx.setStorage({
        key: cat_id,
        data: new Date(),
      });
      // 增加click数
      wx.cloud.callFunction({
        name: 'addPop',
        data: {
          cat_id: cat_id,
          org: true,
        }
      }).then(res => {
        console.log(res);
      });
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {
    // 获取一下屏幕高度
    wx.getSystemInfo({
      success: res => {
        console.log(res);
        heights = {
          "screenHeight": res.screenHeight,
          "windowHeight": res.windowHeight,
          "rpx2px": res.windowWidth / 750,
          "pixelRatio": res.pixelRatio
        }
      }
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    return shareTo(`${this.data.cat.name} - 资料卡`, path);
  },

  loadCat() {
    const db = wx.cloud.database();
    db.collection('orgcat').doc(cat_id).get().then(res => {
      console.log(res);
      res.data.photo = [];
      res.data.characteristics_string = (res.data.colour || '') + '猫';
      // res.data.nickname = (res.data.nickname || []).join('、');
      this.setData({
        cat: res.data
      });
    });
  },

  
  async bindTapPhoto(e) {
    wx.showLoading({
      title: '正在加载...',
      mask: true,
    });
    console.log(e);
    var currentImg = e.currentTarget.dataset.index;
    this.setData({
      showGallery: true,
      imgUrls: this.data.cat.photos,
      currentImg: currentImg,
    });
    wx.hideLoading();
  },
})