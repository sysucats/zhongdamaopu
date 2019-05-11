// miniprogram/pages/filters/filters.js
import { regeneratorRuntime, randomInt, isManager } from '../../utils.js'

// 储存还没确定的新filter
var new_filters = {};

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    cates: [{
      key: 'campus',
      name: '校区位置',
    }, {
      key: 'colour',
      name: '花色',
    }]
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
        that.reloadFilter();
      } else {
        that.setData({
          tipText: '只有管理员能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    })
  },

  // 加载数据库里的filters，应该只有一个
  reloadFilter() {
    wx.showLoading({
      title: '加载中...',
    });
    const that = this;
    const db = wx.cloud.database();
    db.collection('filter').limit(1).get().then(res => {
      console.log(res.data[0]);
      that.setData({
        filters: res.data[0]
      });
      wx.hideLoading();
    });
  },

  // 增加option
  addOptionInput(e) {
    const cate = e.currentTarget.dataset.cate;
    var filters = this.data.filters;
    if (filters[cate].includes('')) {
      return false;
    }
    filters[cate].push(''); // 给一个空串，表示新增的
    new_filters[cate] = ''; // 内存里的也重新赋值
    this.setData({ filters: filters });
  },

  inputOption(e) {
    const cate = e.currentTarget.dataset.cate;
    const value = e.detail.value;
    new_filters[cate] = value;
  },

  addOptionConfirm(e) {
    const cate = e.currentTarget.dataset.cate;
    const value = new_filters[cate];
    var filters = this.data.filters;
    const i = filters[cate].indexOf('');
    if (filters[cate].includes(value)) {
      // 已经有了不能重复
      wx.showToast({
        title: '不能重复',
        icon: 'none',
      });
      return false;
    }
    filters[cate][i] = value;
    this.setData({ filters: filters });
  },

  // 移动、管理option
  moveOption(e) {
    const index = e.currentTarget.dataset.index; 
    const cate = e.currentTarget.dataset.cate;
    const direct = e.currentTarget.dataset.direct; // 'up' or 'down'
    var filters = this.data.filters;
    const len = filters[cate].length;
    const new_index = (direct === 'up') ? index - 1: index + 1;
    if (new_index < 0 || new_index >= len) {
      return false;
    }
    console.log(direct);
    const temp = filters[cate][index];
    filters[cate][index] = filters[cate][new_index];
    filters[cate][new_index] = temp;
    this.setData({ filters: filters });
  },

  deleteOption(e) {
    wx.showLoading({
      title: '检查中...',
      mask: true
    });
    const index = e.currentTarget.dataset.index;
    const cate = e.currentTarget.dataset.cate;
    var filters = this.data.filters;
    const delete_value = filters[cate][index];
    // 检查一下数据库里这个地址有没有猫，如果有就不能删

    const that = this;
    const db = wx.cloud.database();
    const qf = { [cate]: delete_value };
    db.collection('cat').where(qf).count().then(res => {
      console.log(res);
      if (res.total) {
        wx.showToast({
          title: '无法删除有猫猫的选项',
          icon: 'none',
        });
        return false;
      }
      // 执行删除
      filters[cate] = filters[cate].filter(val => val != delete_value);
      this.setData({ filters: filters }, () => {
        wx.showToast({
          title: '删除成功',
        });
      });
    });
  },

  // 确定上传
  uploadFilters() {
    // 先检查有没有空串
    const cates = this.data.cates;
    const filters = this.data.filters;
    var to_upload = {};
    for (const cate of cates) {
      if (filters[cate.key].includes('')) {
        wx.showToast({
          title: '请先完成填空',
          icon: 'none'
        });
        return false;
      }
      // 放到另外一个to_upload里，排除掉id
      to_upload[cate.key] = filters[cate.key];
    }
    // 开始上传
    wx.showLoading({
      title: '正在上传...',
    });
    console.log(to_upload);
    const that = this;
    wx.cloud.callFunction({
      name: 'updateFilter',
      data: {
        to_upload: to_upload,
        filter_id: filters._id
      }
    }).then(res => {
      that.reloadFilter();
    });
  }
})