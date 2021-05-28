// miniprogram/pages/organization/orglist/orglist.js
const utils = require('../../../utils.js');
const checkCanUpload = utils.checkCanUpload;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    org_list: [],
    modal_show: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    var that = this;
    checkCanUpload().then(res => {
      that.setData({
        canUpload: res
      });
    })
    this.getOrgList();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {
    this.getHeights();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '串门 - 中大猫谱'
    }
  },

  onShareTimeline:function () {
    return {
      title: '中大猫谱 - 发现校园身边的猫咪',
    }
  },

  
  // 开始计算各个东西高度
  getHeights() {
    wx.getSystemInfo({
      success: res => {
        console.log(res);
        this.setData({
          "heights.filters": res.screenHeight * 0.065,
          "heights.screenHeight": res.screenHeight,
          "heights.windowHeight": res.windowHeight,
          "heights.statusBarHeight": res.statusBarHeight,
          "heights.rpx2px": res.windowWidth / 750,
        });
      }
    });
  },

  async getOrgList() {
    const db = wx.cloud.database();
    const _ = db.command;
    const query = {status: _.eq("active")};
    var total = (await db.collection('organization').where(query).count()).total;
    console.log(total);
    var org_list = [];
    while (org_list.length < total) {
      var res = await db.collection('organization').where(query).skip(org_list.length).limit(20).get();
      org_list = org_list.concat(res.data);
    }

    for (const org of org_list) {
      var query_cat = _.and({org: org._id}, {hidden: _.neq(true)});
      org.cat_count = (await db.collection('orgcat').where(query_cat).count()).total;
    }

    this.setData({
      org_list: org_list
    });
  },

  toOrg(e) {
    var org_id = e.currentTarget.dataset._id;
    wx.navigateTo({
      url: `/pages/organization/org/org?org_id=${org_id}`,
    })
  },

  toApply() {
    wx.navigateTo({
      url: '/pages/organization/applyorg/applyorg',
    })
  },

  openDetail(e) {
    var index = e.currentTarget.dataset.index;
    var detail = !this.data.org_list[index].detail;
    this.setData({
      [`org_list[${index}].detail`]: detail
    });
  },

  toggleModal() {
    var modal_show = this.data.modal_show;
    this.setData({
      modal_show: !modal_show,
    });
  }
})