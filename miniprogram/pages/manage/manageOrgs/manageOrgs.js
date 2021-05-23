// miniprogram/pages/manage/manageOrgs/manageOrgs.js
const utils = require('../../../utils.js');
const isManager = utils.isManager;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    org_list: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkAuth();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.getOrgList();
  },

  // 加载org
  async getOrgList (){
    const db = wx.cloud.database();
    var total = (await db.collection('organization').count()).total;
    console.log(total);
    var org_list = [];
    while (org_list.length < total) {
      var res = await db.collection('organization').skip(org_list.length).limit(20).get();
      org_list = org_list.concat(res.data);
    }

    this.setData({
      org_list: org_list
    });
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
      } else {
        that.setData({
          tipText: '只有管理员Level-99能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 99)
  },

  // 跳转去修改
  toModify(e) {
    var _id = e.currentTarget.dataset._id;
    wx.navigateTo({
      url: `/pages/manage/modifyOrg/modifyOrg?_id=${_id}`,
    });
  }
})