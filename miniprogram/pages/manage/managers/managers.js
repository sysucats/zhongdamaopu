// miniprogram/pages/manage/managers.js
const utils = require('../../../utils.js');
const isManager = utils.isManager;

// 是否正在加载
var loading = false;

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
    manager_types: ['0-非管理员', '1-审核照片', '2-修改猫猫、校区', '3-处理图片', '99-管理成员']
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkAuth();
    this.getHeights();
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
        that.loadUsers(true);
      } else {
        that.setData({
          tipText: '只有管理员Level-99能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 99)
  },

  // 读取用户列表
  loadUsers: function(reload=false) {
    if (loading) {
      return false;
    }
    const that = this;
    const db = wx.cloud.database();
    var users = this.data.users;
    loading = true;
    wx.showLoading({
      title: '加载中...',
    });
    var userSearch = this.data.userSearch;
    var query = {};
    if (userSearch) {
      query["userInfo.nickName"] = db.RegExp({regexp: userSearch, options: 'ims'});
    }
    if (this.data.managerOnly) {
      query["manager"] = db.command.gt(0);
    }
    console.log("query", query);
    db.collection('user').where(query).skip(users.length).limit(10).get().then(res => {
      console.log(res);
      wx.hideLoading();
      if (reload) {
        users = res.data;
      } else {
        if (!res.data.length) {
          wx.showToast({
            title: '加载完啦',
            icon: 'none',
          })
          loading = false;
          return;
        }
        users = users.concat(res.data);
      }
      that.setData({
        users: users
      }, ()=>{
        loading = false;
      });
    });
  },

  // 滑到底部来reload
  scrollToReload: function(e) {
    this.loadUsers();
  },

  fSearchInput: function (e) {
    const value = e.detail.value;
    this.setData({
      userSearch: value
    });
  },

  // 搜索
  fSearch: function(e) {
    this.data.users = [];
    this.loadUsers(true);
  },

  // 筛选条件复选框
  filterChange(e) {
    let filters = e.detail.value;
    this.data.managerOnly = filters.indexOf('manager-only') != -1;
    this.data.users = [];
    this.loadUsers(true);
  },

  // 获取一下页面高度，铺满scroll-view
  getHeights() {
    wx.getSystemInfo({
      success: res => {
        console.log(res);
        this.setData({
          "windowHeight": res.windowHeight,
        });
      }
    });
  },

  // 更新一下，后台会检查权限，不能修改自己的权限，最大为99
  updateUserLevel(e) {
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
    console.log("#"+index, _id, level);

    const that = this;
    wx.cloud.callFunction({
      name: "updateManager",
      data: {
        _id: _id,
        level: level
      },
      success: (res) => {
        console.log(res);
        if (res.result.ok) {
          wx.showToast({
            title: '更新成功',
          });
        } else {
          wx.showToast({
            title: '更新失败\r\n' + res.result.msg,
            icon: 'none',
          })
        }
      }
    })
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
  }
})