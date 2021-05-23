// miniprogram/pages/organization/org/org.js
const utils = require('../../../utils.js');
const getGlobalSettings = utils.getGlobalSettings;
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.randomInt;
const isWifi = utils.isWifi;
const isManager = utils.isManager;
const shuffle = utils.shuffle;
const loadFilter = utils.loadFilter;
const regReplace = utils.regReplace;
const splitFilterLine = utils.splitFilterLine;

const default_png = undefined;

var catsStep = 1;
var loadingLock = 0;
var org_id = undefined;
Page({

  /**
   * 页面的初始数据
   */
  data: {
    cats: [],

    filters: [],
    filters_sub: 0, // 过滤器子菜单
    filters_legal: true, // 这组过滤器是否合法
    filters_show: false, // 是否显示过滤器
    filters_input: '', // 输入的内容，目前只用于挑选名字
    filters_show_shadow: false, // 滚动之后才显示阴影

    // 高度，单位为px（后面会覆盖掉）
    heights: {
      filters: 40,
    },
    // 总共有多少只猫
    catsMax: 0,

    // 加载相关
    loading: false, // 正在加载
    loadnomore: false, // 没有再多了

    // 广告是否展示
    ad_show: {},
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    org_id = options._id;
    this.checkAuth();
    this.loadOrg();
    
    // 开始加载页面
    const that = this;
    getGlobalSettings('organization').then(settings => {
      // 先把设置拿到
      catsStep = settings['catsStep'];

      that.setData({
        main_lower_threshold: settings['main_lower_threshold'],
        adStep: settings['adStep']
      });
    });

    var scene = wx.getLaunchOptionsSync().scene;
    console.log(scene);
    if(scene === 1154){
      const db = wx.cloud.database();
      db.collection('setting').doc('pages').get().then(res => {
        var genealogySetting = res.data['organization'];
        console.log("genealogySetting", genealogySetting);
        that.setData({
          main_lower_threshold: genealogySetting['main_lower_threshold'],
          adStep: genealogySetting['adStep']
        })
        catsStep = genealogySetting['catsStep']
      });
    }
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
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },
  
  // 检查权限
  checkAuth() {
    console.log(org_id);
    const that = this;
    wx.cloud.callFunction({
      name: 'isOrgManager',
      data: {
        org_id: org_id
      }
    }).then(res => {
      console.log(res);
      that.setData({
        auth: res.result
      })
    });
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


  // 加载当前org
  async loadOrg (){
    const db = wx.cloud.database();
    var org = (await db.collection('organization').doc(org_id).get()).data;
    console.log(org);
    this.loadFilters(org);
    this.setData({
      org: org,
    });
  },
  
  loadFilters: function (org) {
    // 下面开始加载filters
    var filters = [
      {
        key: "address",
        name: "位置",
        category:  ["全部位置"].concat(splitFilterLine(org.address)),
        selected: [0, 2],
        active: true,
      },
      {
        key: "colour",
        name: "花色",
        category:  ["全部花色"].concat(splitFilterLine(org.colour)),
        selected: [0],
      },
    ];

    console.log(filters);
    this.setData({
      filters: filters,
    }, () => {
      // this.reloadCats();
    });
  },

  ////// 下面开始新的filter //////
  // mask滑动事件catch
  voidMove: function () {},
  // toggle filters
  fToggle: function () {
    // 这里只管显示和隐藏，类似取消键的功能
    this.setData({
      filters_show: !this.data.filters_show
    });
  },
  // 点击main filter，切换sub的
  fClickMain: function (e) {
    var filters = this.data.filters;
    const click_idx = e.currentTarget.dataset.index;

    for (var item of filters) {
      item.active = false;
    }
    filters[click_idx].active = true;

    this.setData({
      filters: filters,
      filters_sub: click_idx
    });
  },
  // 点击category filter，全选/反选该类下所有sub
  fClickCategory: function (e) {
    var filters = this.data.filters;
    var filters_sub = this.data.filters_sub;

    const index = e.target.dataset.index;
    const all_active = !filters[filters_sub].category[index].all_active;
    var category = filters[filters_sub].category[index];
    if (index == 0) { // 默认第0个是'全部'
      for (let i = 0, len = filters[filters_sub].category.length; i < len; ++i) { // 把所有项反激活
        var ctg = filters[filters_sub].category[i];
        ctg.all_active = false;
        for (let k = 0, length = ctg.items.length; k < length; ++k) {
          ctg.items[k].active = false;
        }
      }
      filters[filters_sub].category[index].all_active = all_active; // '全部'的激活状态
    } else {
      filters[filters_sub].category[0].all_active = false; // 取消'全部'的激活，默认第0个是'全部'
      category.all_active = all_active; // 点击的category状态取反
      /* for (let k = 0, len = category.items.length; k < len; ++k) {  // 其下的所有项目激活状态与category一致
        category.items[k].active = all_active;
      } */
      for (let k = 0, len = category.items.length; k < len; ++k) { // 反激活其下所有sub
        category.items[k].active = false;
      }
    }
    const fLegal = this.fCheckLegal(filters);
    this.setData({
      filters: filters,
      filters_legal: fLegal
    });
  },
  // 点击sub filter，切换激活项
  fClickSub: function (e) {
    var filters = this.data.filters;
    var filters_sub = this.data.filters_sub;

    const category = filters[filters_sub].category[e.target.dataset.index];
    const index = e.target.dataset.innerindex;

    category.items[index].active = !category.items[index].active; // 激活状态取反
    filters[filters_sub].category[0].all_active = false; // 取消'全部'的激活，默认第0个是'全部'
    /* // 看看是否要把category激活/反激活
    var counter = 0;
    for (let k = 0, len = category.items.length; k < len; ++k) {
      if (category.items[k].active) ++counter;
    }
    category.all_active = (counter == category.items.length); */
    category.all_active = false; // 直接反激活category

    const fLegal = this.fCheckLegal(filters);
    this.setData({
      filters: filters,
      filters_legal: fLegal
    });
  },
  // 检查现在这个filter是否有效，如果没有，那就deactive完成键
  fCheckLegal: function (filters) {
    for (const mainF of filters) {
      var count = 0; // 激活的数量
      if (mainF.category[0].all_active) continue; // '全部'是激活的
      for (const category of mainF.category) {
        if (category.all_active) {
          count += category.items.length;
          continue;
        }
        for (const item of category.items) {
          if (item.active) ++count;
        }
      }
      if (count == 0) return false;
    }
    return true;
  },
  fGet: function () {
    const db = wx.cloud.database();
    const _ = db.command;
    const filters = this.data.filters;
    var res = []; // 先把查询条件全部放进数组，最后用_.and包装，这样方便跨字段使用or逻辑
    // 这些是点击选择的filters
    for (const mainF of filters) {
      // 把数据库要用的key拿出来
      const key = mainF.key;
      var selected = []; // 储存已经选中的项
      const cateFilter = Boolean(mainF.cateKey);
      if (cateFilter) { // 如果分类的名字也会作为筛选内容，这种筛选可能是因为不同类间key字段可能重名
        var cateKey = mainF.cateKey;
        var cateSelected = [];
      }

      // 下面开始遍历每个分类下的子项
      if (mainF.category[0].all_active) continue; // 选择了'全部', 不用管这个类

      for (const category of mainF.category) {
        let cateKeyPushed = false; // 一个category只用push一次，记一下
        for (const item of category.items) {
          if (category.all_active || item.active) {
            selected.push(item.name);
            if (cateFilter && !cateKeyPushed) {
              cateSelected.push(category.name);
              cateKeyPushed = true;
            }
          }
        }
      }

      res.push({[key]: _.in(selected)});
      if (cateFilter) res.push({[cateKey]: _.in(cateSelected)});
    }
    // 判断一下filters生效没有

    this.setData({
      filters_active: res.length > 0
    });

    // 如果用户还输入了东西，也要一起搜索
    const filters_input = regReplace(this.data.filters_input);
    if (filters_input.length) {

      var search_str = '';
      for (const n of filters_input.trim().split(' ')) {
        if (search_str === '') {
          search_str += '(.*' + n + '.*)';
        } else {
          search_str += '|(.*' + n + '.*)';
        }
      }
      // res['name'] = _.in(filters_input.trim().split(' '));
      let regexp = db.RegExp({
        regexp: search_str,
        options: 'igs',
      });
      res.push(_.or([{name: regexp}, {nickname: regexp}]));
    }
    return res.length ? _.and(res) : {};
  },
  fComfirm: function () {
    if (!this.data.filters_legal) {
      return false;
    }

    this.reloadCats();
    this.fToggle();
  },
  fReset: function () {
    // 重置所有分类
    var filters = this.data.filters;
    // const filters_sub = this.data.filters_sub;
    for (let sub = 0, len = filters.length; sub < len; ++sub) {
      for (let i = 0, catelen = filters[sub].category.length; i < catelen; ++i) {
        var category = filters[sub].category[i];
        category.all_active = false;
        for (let k = 0, itemlen = category.items.length; k < itemlen; ++i) {
          category.items[k].active = false;
        }
      }
      filters[sub].category[0].active = true; // 默认第0个是'全部'
    }

    const fLegal = this.fCheckLegal(filters);
    this.setData({
      filters: filters,
      filters_legal: fLegal
    });
  },
  // 发起文字搜索
  fSearchInput: function (e) {
    const value = e.detail.value;
    this.setData({
      filters_input: value
    });
  },
  fSearch: function (e) {
    this.reloadCats();
  },
  // 搜索框是否要显示阴影
  fScroll: function (e) {
    const scrollTop = e.detail.scrollTop;
    const filters_show_shadow = this.data.filters_show_shadow;
    if ((scrollTop < 50 && filters_show_shadow == true) || (scrollTop >= 50 && filters_show_shadow == false)) {
      this.setData({
        filters_show_shadow: !filters_show_shadow
      });
    }
  },

  
  ////// 广告相关
  changeState(ad_id, show) {
    var ad_show = this.data.ad_show;
    if (ad_show[ad_id] != show) {
      ad_show[ad_id] = show;
      this.setData({
        ad_show: ad_show
      });
    }
  },
  // 广告加载成功，展示出来
  adLoad(e) {
    const ad_id = e.currentTarget.dataset.ad_id;
    console.log('广告加载成功', ad_id);
    this.changeState(ad_id, true);
  },
  // 加载失败
  adError(e) {
    const ad_id = e.currentTarget.dataset.ad_id;
    console.log('广告加载失败', ad_id);
    this.changeState(ad_id, false);
  },
  // 被关闭
  adClose(e) {
    const ad_id = e.currentTarget.dataset.ad_id;
    console.log('广告被关闭', ad_id);
    this.changeState(ad_id, false);
  },

  // 跳转到管理页
  toOrgSettings() {
    wx.navigateTo({
      url: `/pages/organization/orgsettings/orgsettings?org_id=${org_id}`,
    })
  },
})