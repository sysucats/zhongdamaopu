// miniprogram/pages/genealogy/genealogy.js
const utils = require('../../utils.js');
const getGlobalSettings = utils.getGlobalSettings;
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.randomInt;
const isWifi = utils.isWifi;
const isManager = utils.isManager;
const shuffle = utils.shuffle;
const loadFilter = utils.loadFilter;
const regReplace = utils.regReplace;

const default_png = undefined;


var catsStep = 1;
var loadingLock = 0;

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

    // 对应数据库的key
    filter_keys_name: {
      'campus': '校区',
      'colour': '花色'
    },

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
    // 从分享点进来，到跳转到其他页面
    if (options.toPath) {
      wx.navigateTo({
        url: decodeURIComponent(options.toPath),
      });
    }
    // 从扫描二维码扫进来，目前只用于猫猫二维码跳转
    if (options.scene) {
      const scene = decodeURIComponent(options.scene);
      console.log(scene);
      if(scene.startsWith('toC=')) {
        const cat_No = scene.substr(4);
        const db = wx.cloud.database();
        const that = this;
        db.collection('cat').where({ _no: cat_No }).field({ _no: true }).get().then(res => {
          if (!res.data.length) {
            return;
          }
          const _id = res.data[0]._id;
          that.clickCatCard(_id, true);
        })
      }
    }
    // 开始加载页面
    const that = this;
    getGlobalSettings('genealogy').then(settings => {
      // 先把设置拿到
      catsStep = settings['catsStep'];
      // 启动加载
      that.loadFilters();

      that.setData({
        main_lower_threshold: settings['main_lower_threshold'],
        adStep: settings['adStep']
      });
    })
  },

  loadFilters: function() {
    // 下面开始加载filters
    loadFilter().then(res => {

      var filters = [];
      for (const k in this.data.filter_keys_name) {
        var main_item = {};
        main_item.key = k;
        main_item.name = this.data.filter_keys_name[k];
        main_item.items = [];
        main_item.items.push({
          name: '全部' + this.data.filter_keys_name[k],
          active: true,
        });
        for (const item of res[k]) {
          var new_item = {
            name: item,
            active: false
          }
          main_item.items.push(new_item);
        }
        filters.push(main_item);
      }
      // 默认把第一个先激活了
      filters[0].active = true;
      console.log(filters);
      this.setData({
        filters: filters,
      }, () => { this.reloadCats(); });
    })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {
    this.getHeights();
  },

  
  
  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    this.loadMoreCats();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '猫谱 - 中大猫谱'
    }
  },

  checkNeedLoad() {
    if (this.data.cats.length >= this.data.catsMax) {
      this.setData({
        loadnomore: true
      });
      return false;
    }
    return true;
  },

  reloadCats() {
    // 增加lock
    loadingLock ++;
    const nowLoadingLock = loadingLock;
    const db = wx.cloud.database();
    const cat = db.collection('cat');
    const query = this.fGet();
    cat.where(query).count().then(res => {
      if (loadingLock != nowLoadingLock) {
        // 说明过期了
        return false;
      }
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
      const cat = db.collection('cat');
      const _ = db.command;
      const query = that.fGet();
      console.log("query condition: " + JSON.stringify(query));
      cat.where(query).orderBy('mphoto', 'desc').orderBy('popularity', 'desc').skip(cats.length).limit(step).get().then(res => {
        if (loadingLock != nowLoadingLock) {
          // 说明过期了
          return false;
        }
        console.log(res.data);
        res.data = shuffle(res.data);
        for (var d of res.data) {
          d.photo = default_png;
          d.characteristics_string = [(d.colour || '') + '猫'].concat(d.characteristics || []).join('，');
          if (!d.mphoto) {
            d.mphoto_new = false;
          } else {
            const today = new Date();
            const delta_date = today - (new Date(d.mphoto)); // milliseconds
            // 小于7天
            d.mphoto_new = ((delta_date / 1000 / 3600 / 24) < 7);
          }
        }
        const new_cats = cats.concat(res.data);
        that.setData({
          cats: new_cats,
          loading: false,
          loadnomore: Boolean(new_cats.length === that.data.catsMax )
        }, () => {
          that.loadCatsPhoto().then();
        });
      });
    });
  },

  async loadCatsPhoto() {
    // 加载lock
    const nowLoadingLock = loadingLock;

    const cats = this.data.cats;
    const db = wx.cloud.database();
    const photo = db.collection('photo');

    var cat2photos = {};
    for (var cat of cats) {
      if (cat.photo === default_png) {
        const qf = { cat_id: cat._id, verified: true, best: true };
        var total = cat.photo_count;
        // var total = (await photo.where(qf).count()).total;
        if (!total || total === 0) {
          // 说明这只猫还没有照片
          continue;
        }

        // 这里对于API调用的次数较多，需要修改
        var index = randomInt(0, total);
        var pho_src = (await photo.where(qf).skip(index).limit(1).get()).data;
        cat2photos[cat._id] = pho_src[0];
        // cat.photo = pho_src[0];
      }
    }

    if (loadingLock != nowLoadingLock) {
      console.log("过期了，照片数量：" + cats.length);
      // 说明过期了
      return false;
    }

    // 这里重新获取一遍，因为可能已经刷新了
    var new_cats = this.data.cats;
    for (var c of new_cats) {
      if (cat2photos[c._id]) {
        c.photo = cat2photos[c._id];
      }
    }

    this.setData({
      cats: new_cats
    });

  },
  
  // 点击猫猫卡片
  clickCatCard(e, isCatId=false) {
    const cat_id = isCatId ? e : e.currentTarget.dataset.cat_id;
    const detail_url = '/pages/genealogy/detailCat/detailCat';
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
          "heights.filters": res.screenHeight * 0.07,
          "heights.screenHeight": res.screenHeight,
          "heights.windowHeight": res.windowHeight,
          "heights.statusBarHeight": res.statusBarHeight,
          "heights.rpx2px": res.windowWidth / 750,
        });
      }
    });
  },
  // 管理员判断，其实可以存到global里
  bindManageCat(e) {
    const that = this;
    isManager(res => {
      if (res) {
        const cat_id = e.currentTarget.dataset.cat_id;
        wx.navigateTo({
          url: '/pages/manage/addCat/addCat?cat_id=' + cat_id,
        });
      } else {
        console.log("not a manager");
      }
    })
  },

  ////// 下面开始新的filter //////
  // mask滑动事件catch
  voidMove: function () { },
  // toggle filters
  fToggle: function () {
    // 这里只管显示和隐藏，类似取消键的功能
    this.setData({
      filters_show: !this.data.filters_show
    });
  },
  // 点击main filter，切换sub的
  fClickMain: function(e) {
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
  // 点击sub filter，切换激活项
  fClickSub: function (e) {
    var filters = this.data.filters;
    var filters_sub = this.data.filters_sub;
    
    const click_idx = e.currentTarget.dataset.index;
    const item = filters[filters_sub].items[click_idx];
    // 获取到了点击的东西，下面开始各种情况的判断。
    // 点击的东西包括“全部”两字
    if (item.name.includes('全部')) {
      // 它自己反激活，其他全部不激活
      const tmp = filters[filters_sub].items[click_idx].active;
      for (var it of filters[filters_sub].items) {
        it.active = false;
      }
      filters[filters_sub].items[click_idx].active = !tmp;
    } else if (filters[filters_sub].key == 'campus' && item.name.includes('校区')) {
      // 如果是选中某个校区，那就反激活它，不激活其他这个校区的小东西
      const tmp = filters[filters_sub].items[click_idx].active;
      for (var it of filters[filters_sub].items) {
        if (it.name.substr(0, 2) == item.name.substr(0, 2)) {
          it.active = false;
        }
      }
      filters[filters_sub].items[click_idx].active = !tmp;
      // 同时第一个“全部校区”要不激活
      filters[filters_sub].items[0].active = false;
    } else {
      // 这两个情况都不是，那就直接反激活它自己，同时把该校区全选的不激活
      filters[filters_sub].items[click_idx].active ^= 1;
      for (var it of filters[filters_sub].items) {
        if (it.name.includes('校区') && it.name.substr(0, 2) == item.name.substr(0, 2)) {
          it.active = false;
        }
      }
      // 同时第一个“全部校区”要不激活
      filters[filters_sub].items[0].active = false;
    }
    const fLegal = this.fCheckLegal(filters);
    this.setData({
      filters: filters,
      filters_legal: fLegal
    });
  },
  // 检查现在这个filter是否有效，如果没有，那就deactive完成键
  fCheckLegal: function(filters) {
    for (const mainF of filters) {
      var count = 0; // 激活的数量
      for (const item of mainF.items) {
        if (item.active) {
          count ++;
          break;
        }
      }
      if (count==0) {
        return false;
      }
    }
    return true;
  },
  fGet: function() {
    const db = wx.cloud.database();
    const _ = db.command;
    const filters = this.data.filters;
    var res = {};
    // 这些是点击选择的filters
    for (const main_item of filters) {
      // 把数据库要用的key拿出来
      const key = main_item.key;
      var selected = []; // 储存已经选中的项

      // 下面开始遍历每个分类下的子项
      for (const sub_item of main_item.items) {
        // 没有激活的就跳过
        if (!sub_item.active) {
          continue;
        }

        // 说明选择了全部东东，不需要过滤这个分类
        if (sub_item.name.includes('全部')) {
          break;
        }

        // 如果选中的是某个校区，那么把该校区下面的全部东西都放进去
        if (key == 'campus' && sub_item.name.includes('校区')) {
          const campus_name = sub_item.name.substr(0, 2);
          for (const item of main_item.items) {
            // 说明是这个校区的一个区域
            if (item.name.substr(0, 2) == campus_name && item.name != sub_item.name) {
              selected.push(item.name);
            }
          }
        } else {
          // 其他被激活的项直接放进去
          selected.push(sub_item.name);
        }
      }
      
      if (selected.length) {
        res[key] = _.in(selected);
      }
    }
    // 判断一下filters生效没有

    this.setData({
      filters_active: Object.keys(res).length > 0
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
      res['name'] = db.RegExp({
        regexp: search_str,
        options: 'igs',
      })
    }
    return res;
  },
  fComfirm: function() {
    if (!this.data.filters_legal) {
      return false;
    }

    this.reloadCats();
    this.fToggle();
  },
  fReset: function() {
    // 重置所有分类
    var filters = this.data.filters;
    // const filters_sub = this.data.filters_sub;
    for (const filters_sub in filters) {
      for (var sub_item of filters[filters_sub].items) {
        if (sub_item.name.includes('全部')) {
          sub_item.active = true;
        } else {
          sub_item.active = false;
        }
      }
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
  fSearch: function(e) {
    this.reloadCats();
  },
  // 搜索框是否要显示阴影
  fScroll: function(e) {
    const scrollTop = e.detail.scrollTop;
    const filters_show_shadow = this.data.filters_show_shadow;
    if ((scrollTop < 50 && filters_show_shadow == true) || (scrollTop >= 50 && filters_show_shadow == false)) {
      this.setData({
        filters_show_shadow: !filters_show_shadow
      });
    }
  },
  // 跳转去修改filters
  toUpdateFilter: function () {
    const that = this;
    isManager(res => {
      if (res) {
        wx.navigateTo({
          url: '/pages/manage/filters/filters',
        });
      } else {
        console.log("not a manager");
      }
    });
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
    console.log('广告加载', ad_id);
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
  }
})