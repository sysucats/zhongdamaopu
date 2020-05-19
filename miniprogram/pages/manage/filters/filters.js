const utils = require('../../../utils.js');
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.randomInt;
const isManager = utils.isManager;
const loadFilter = utils.loadFilter;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    filters: [],
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
          tipText: '只有管理员Level-2才能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 2);
  },

  // 加载数据库里的filters，应该只有一个
  reloadFilter() {
    wx.showLoading({
      title: '加载中...',
    });
    const that = this;
    loadFilter().then(res => {
      var filters = [];

      var area_item = {
        key: 'area',
        cateKey: 'campus',
        name: '校区',
        category: [],
      };
      // 用个object当作字典，把area分下类
      var classifier = {};
      for (let i = 0, len = res.campuses.length; i < len; ++i) {
        classifier[res.campuses[i]] = {
          name: res.campuses[i],
          items: [],    // 记录属于这个校区的area
          adding: false,
        };
      }
      for (let k = 0, len = res.area.length; k < len; ++k) {
        classifier[res.area[k].campus].items.push(res.area[k]);
      }
      for (let i = 0, len = res.campuses.length; i < len; ++i) {
        area_item.category.push(classifier[res.campuses[i]]);
      }
      filters.push(area_item);

      var colour_item = {
        key: 'colour',
        name: '花色',
        category: [{
          name: '花色',
          items: res.colour.map(name => {
            return { name: name };
          }),
          adding: false,
        }]
      }
      filters.push(colour_item);
      console.log(filters);
      this.setData({
        filters: filters
      })
      wx.hideLoading();
    })
  },

  // 增加option
  addOptionInput(e) {
    const filters_sub = e.currentTarget.dataset.filterssub;
    const index = e.currentTarget.dataset.cateindex;
    var filters = this.data.filters;
    var category = filters[filters_sub].category[index];
    category.adding = true;
    this.setData({ filters: filters });
  },

  addOptionConfirm(e) {
    var filters = this.data.filters;

    const name = e.detail.value.name;
    const filters_sub = e.currentTarget.dataset.filterssub;
    const index = e.currentTarget.dataset.cateindex;
    
    var mainF = filters[filters_sub]
    var category = mainF.category[index];

    if (name == '') { // 名字不能为空
      return false;
    }
    for (let k = 0, length = category.items.length; k < length; ++k) {   // 检查类内有无重名
      if (name == category.items[k].name) {
        wx.showToast({
          title: '名字不能重复',
          icon: 'none'
        })
        return false;
      }
    }
    
    category.items.push({
      name: name,
      campus: category.name
    })
    category.adding = false;
    this.setData({ filters: filters });
  },

  // 移动、管理option
  moveOption(e) {
    var filters = this.data.filters;

    const filters_sub = e.currentTarget.dataset.filterssub;
    const cateindex = e.currentTarget.dataset.cateindex;
    const index = e.currentTarget.dataset.innerindex; 
    const direct = e.currentTarget.dataset.direct; // 'up' or 'down'

    const category = filters[filters_sub].category[cateindex];
    
    const len = category.items.length;
    const new_index = (direct === 'up') ? index - 1: index + 1;
    if (new_index < 0 || new_index >= len) {
      return false;
    }
    console.log(direct);
    const temp = category.items[index];
    category.items[index] = category.items[new_index];
    category.items[new_index] = temp;
    this.setData({ filters: filters });
  },

  deleteOption(e) {
    wx.showLoading({
      title: '检查中...',
      mask: true
    });
    var filters = this.data.filters;

    const filters_sub = e.currentTarget.dataset.filterssub;
    const cateindex = e.currentTarget.dataset.cateindex;
    const index = e.currentTarget.dataset.innerindex;

    const mainF = filters[filters_sub];
    const category = mainF.category[cateindex];
    const delete_value = category.items[index];
    
    // 检查一下数据库里这个地址有没有猫，如果有就不能删
    const that = this;
    const db = wx.cloud.database();
    var qf = { [mainF.key]: category.items[index].name };
    if (mainF.cateKey) {
      qf[mainF.cateKey] = category.name;
    }
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
      category.items = category.items.filter(val => val != delete_value);
      this.setData({ filters: filters }, () => {
        wx.showToast({
          title: '删除成功',
        });
      });
    });
  },

  // 确定上传
  uploadFilters() {
    var filters = this.data.filters;
    // 开始上传
    wx.showLoading({
      title: '正在上传...',
    });
    console.log(filters);
    // 处理回数据库中的原始格式
    var area = [];
    var colour = [];
    for (const mainF of filters) {
      for (const category of mainF.category) {
        for (const item of category.items) {
          if (mainF.key == 'area') {
            area.push({
              name: item.name,
              campus: item.campus,
            });
          } else if (mainF.key == 'colour') {
            colour.push(item.name);
          }
        }
      }
    }
    const that = this;
    wx.cloud.callFunction({
      name: 'updateFilter',
      data: {
        to_upload: {
          area: area,
          colour: colour
        }
      }
    }).then(res => {
      that.reloadFilter();
    });
  }
})