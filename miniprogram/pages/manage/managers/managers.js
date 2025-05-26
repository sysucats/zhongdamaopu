// miniprogram/pages/manage/managers.js
import { checkAuth } from "../../../utils/user";
import api from "../../../utils/cloudApi";

// 是否正在加载
var loading = false;
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    userSearch: '',
    managerOnly: false,
    users: [],
    windowHeight: "300",
    manager_types: ['0-非管理员', '1-审核照片、删除便利贴', '2-修改猫猫、校区、关系、徽章', '3-发布公告', '99-管理成员、页面设置、处理图片']
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await checkAuth(this, 99)) {
      await this.loadUsers(true);
      this.getHeights();
    }
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

  },

  // 读取用户列表
  loadUsers: async function (reload) {
    if (loading) {
      return false;
    }
    var users = this.data.users;
    loading = true;
    wx.showLoading({
      title: '加载中...',
    });
    var userSearch = this.data.userSearch;
    var query = {};
    if (userSearch) {
      query["userInfo.nickName"] = { $regex: userSearch }
    }
    if (this.data.managerOnly) {
      query["manager"] = { $gt: 0 }
    }
    if (this.data.role1Only) {
      query["role"] = { $gt: 0 }
    }
    console.log("query", query);
    var { result: userRes } = await app.mpServerless.db.collection('user').find(query, { skip: users.length, limit: 10 })
    console.log(userRes);
    wx.hideLoading();
    if (reload) {
      users = userRes;
    } else {
      if (!userRes.length) {
        wx.showToast({
          title: '加载完啦',
          icon: 'none',
        })
        loading = false;
        return;
      }
      users = users.concat(userRes);
    }
    this.setData({
      users: users
    });
    loading = false;
  },

  // 滑到底部来reload
  scrollToReload: async function (e) {
    await this.loadUsers();
  },

  fSearchInput: function (e) {
    const value = e.detail.value;
    this.setData({
      userSearch: value
    });
  },

  // 搜索
  fSearch: async function (e) {
    this.data.users = [];
    await this.loadUsers(true);
  },

  // 筛选条件复选框
  async filterChange(e) {
    let filters = e.detail.value;
    this.data.managerOnly = filters.indexOf('manager-only') != -1;
    this.data.role1Only = filters.indexOf('role1-only') != -1;
    this.data.users = [];
    await this.loadUsers(true);
  },

  // 获取一下页面高度，铺满scroll-view
  getHeights() {
    const res = wx.getSystemInfoSync();
    this.setData({
      "windowHeight": res.windowHeight,
    });
  },

  // 更新一下，后台会检查权限，不能修改自己的权限，最大为99
  async updateUserLevel(e) {
    const index = e.detail.value.index;
    const _id = e.detail.value._id;
    var level = parseInt(e.detail.value.level);
    if (isNaN(level)) {
      level = null;
    }
    if (level == this.data.manager_types.length - 1) {
      // 最后一个是99管理员
      level = 99;
    }
    console.log("#" + index, _id, level);

    const res = await api.curdOp({
      operation: "update",
      collection: "user",
      item_id: _id,
      data: {
        manager: level
      }
    })

    console.log("updateManager Result:", res);
    if (res.ok && res.n == 1) {
      wx.showToast({
        title: '更新成功',
      });
    } else {
      wx.showToast({
        title: '更新失败',
        icon: 'none',
      })
    }
  },

  // 改动了其中一个picker
  changePickerValue(e) {
    const value = parseInt(e.detail.value);
    var index = e.currentTarget.dataset.index;
    if (index == this.data.manager_types.length - 1) {
      // 最后一个是99管理员
      index = 99;
    }
    this.setData({
      ["users[" + index + "].manager"]: value
    });
  },
})