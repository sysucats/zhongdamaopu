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
    org_id = options.org_id;
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

  // 触底
  onReachBottom: function () {
    this.loadMoreCats();
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

  // 点击猫猫卡片
  clickCatCard(e, isCatId) {
    const cat_id = isCatId ? e : e.currentTarget.dataset.cat_id;
    const detail_url = '/pages/organization/detailorgcat/detailorgcat';
    wx.navigateTo({
      url: detail_url + '?cat_id=' + cat_id,
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
    if (org.status == 'locked') {
      // 封禁状态
      wx.showModal({
        title: '哦吼',
        content: '加载失败，看看其他猫猫吧~',
        showCancel: false,
        success: (res) => {
          wx.switchTab({
            url: '/pages/genealogy/genealogy',
          });
        }
      });
      return false;
    }
    console.log(org);
    this.loadFilters(org);
    this.setData({
      org: org,
    });

    // 设置一下标题
    wx.setNavigationBarTitle({
      title: org.name
    })
  },

  // 检查是否需要继续加载猫猫
  checkNeedLoad() {
    if (this.data.cats.length >= this.data.catsMax) {
      this.setData({
        loadnomore: true
      });
      return false;
    }
    return true;
  },
  
  // 加载猫猫
  reloadCats() {
    // 增加lock
    loadingLock++;
    const nowLoadingLock = loadingLock;
    const db = wx.cloud.database();
    const cat = db.collection('orgcat');
    const query = this.fGet();
    console.log(query);
    cat.where(query).count().then(res => {
      if (loadingLock != nowLoadingLock) {
        // 说明过期了
        return false;
      }
      console.log(res);
      this.setData({
        cats: [],
        catsMax: res.total,
        loadnomore: false,
      }, function () {
        this.loadMoreCats();
      });
    });
  },

  
  // 加载更多的猫猫
  loadMoreCats() {
    // 加载lock
    const nowLoadingLock = loadingLock;
    if (!this.checkNeedLoad() || this.data.loading) {
      return false;
    }
    const that = this;
    this.setData({
      loading: true
    }, () => {
      var cats = that.data.cats;
      var step = catsStep;
      const db = wx.cloud.database();
      const cat = db.collection('orgcat');
      const _ = db.command;
      const query = that.fGet();
      console.log("query condition: ", query);
      cat.where(query).orderBy('mphoto', 'desc').orderBy('popularity', 'desc').skip(cats.length).limit(step).get().then(res => {
        if (loadingLock != nowLoadingLock) {
          // 说明过期了
          return false;
        }
        console.log(res.data);
        res.data = shuffle(res.data);
        for (var d of res.data) {
          d.photo = default_png;
          d.characteristics_string = [(d.colour || '') + '猫'].concat(d.looks || []).join('，');
        }
        const new_cats = cats.concat(res.data);
        that.setData({
          cats: new_cats,
          loading: false,
          loadnomore: Boolean(new_cats.length === that.data.catsMax)
        });
      });
    });
  },

  
  loadFilters: function (org) {
    // 下面开始加载filters
    var address = splitFilterLine(org.address);
    var colour = splitFilterLine(org.colour);
    var filters = [
      {
        key: "address",
        name: "位置",
        category:  ["全部位置"].concat(address),
        selected: [true].concat(Array(address.length).fill(false)),
        active: true,
      },
      {
        key: "colour",
        name: "花色",
        category:  ["全部花色"].concat(colour),
        selected: [true].concat(Array(colour.length).fill(false)),
      },
    ];

    console.log(filters);
    this.setData({
      filters: filters,
    }, () => {
      this.reloadCats();
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
    var selected = filters[filters_sub].selected;

    const index = e.target.dataset.index;
    selected[index] = !selected[index];
    if (index != 0) {
      selected[0] = false;
    } else if (index == 0 && selected[0]) {
      // 0号表示“全部”
      for (let i = 1; i < selected.length; i++) {
        selected[i] = false;
      }
    }

    const fLegal = this.fCheckLegal(filters);
    this.setData({
      filters: filters,
      filters_legal: fLegal,
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
      var actived = false;
      for (const el of mainF.selected) {
        if (el) {
          actived = true;
          break;
        };
      }
      if (!actived) return false;
    }
    return true;
  },
  fGet: function () {
    const db = wx.cloud.database();
    const _ = db.command;
    const filters = this.data.filters;
    var res = [{org: org_id}, {hidden: _.neq(true)}]; // 先把查询条件全部放进数组，最后用_.and包装，这样方便跨字段使用or逻辑
    // 这些是点击选择的filters
    for (const mainF of filters) {
      // 把数据库要用的key拿出来
      const key = mainF.key;
      var selected = []; // 储存已经选中的项

      // 下面开始遍历每个分类下的子项
      if (mainF.selected[0] === true) continue; // 选择了'全部', 不用管这个类

      
      for (let i = 1; i < mainF.selected.length; i++) {
        if (mainF.selected[i]) {
          selected.push(mainF.category[i]);
        }
      }
      
      res.push({[key]: _.in(selected)});
    }

    // 判断一下filters生效没有
    this.setData({
      filters_active: res.length > 2, // 这里是2的原因是初始有一个org_id和一个hidden
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
    for (var mainF of filters) {
      for (let i = 0; i < mainF.selected.length; i++) {
        mainF.selected[i] = false;
      }
      mainF.selected[0] = true;
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