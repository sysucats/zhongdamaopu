// miniprogram/pages/organization/detailorgcat/detailorgcat.js
const utils = require('../../../utils.js');
const shareTo = utils.shareTo;
const getCurrentPath = utils.getCurrentPath;
const checkMultiClick = utils.checkMultiClick;


// 页面设置，从global读取
var cat_id;

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
    console.log(e.currentTarget.dataset);
    var urls = this.data.cat.photos;
    var currentImg = e.currentTarget.dataset.index;
    currentImg = urls[currentImg];
    console.log(currentImg);
    wx.previewImage({
      urls: urls,
      current: currentImg
    });
  },
})