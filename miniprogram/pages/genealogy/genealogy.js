import {
  shuffle,
  regReplace,
  getDeltaHours,
  sleep,
  getCurrentPath
} from "../../utils/utils";
import {
  getAvatar,
  getVisitedDate
} from "../../utils/cat";
import {
  getCatCommentCount
} from "../../utils/comment";
import { getUserInfo } from "../../utils/user";
import cache from "../../utils/cache";
import config from "../../config";
import { loadFilter, getGlobalSettings, showTab } from "../../utils/page";
import { isManagerAsync, checkCanShowNews } from "../../utils/user";
import { cloud } from "../../utils/cloudAccess";

const default_png = undefined;

const tipInterval = 24; // 提示间隔时间 hours

// 分享的标语
const share_text = config.text.app_name + ' - ' + config.text.genealogy.share_tip;

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
    filters_empty: true, // 过滤器是否为空

    // 高度，单位为px（后面会覆盖掉）
    heights: {
      filters: 40,
    },
    // 总共有多少只猫
    catsMax: 0,

    // 加载相关
    loading: false, // 正在加载
    loadnomore: false, // 没有再多了

    // 领养状态
    adopt_desc: config.cat_status_adopt,
    // 寻找领养的按钮
    adopt_count: 0,

    // 广告是否展示
    ad_show: {},
    // 广告id
    ad: {},

    // 需要弹出的公告
    newsList: [],
    newsImage: "",

    text_cfg: config.text
  },

  jsData: {
    catsStep: 1,
    loadingLock: 0,
    pageLoadingLock: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    // 从缓存里读取options
    var fcampus = options.fcampus;
    if (!fcampus) {
      fcampus = this.getFCampusCache();
    }
    // 从分享点进来，到跳转到其他页面
    if (options.toPath) {
      wx.navigateTo({
        url: decodeURIComponent(options.toPath),
      });
    }
    // 从扫描二维码扫进来，目前只用于猫猫二维码跳转
    if (options.scene) {
      const scene = decodeURIComponent(options.scene);
      console.log("scene:", scene);
      if (scene.startsWith('toC=')) {
        const cat_No = scene.substr(4);
        const db = await cloud.databaseAsync();
        var cat_res = await db.collection('cat').where({
          _no: cat_No
        }).field({
          _no: true
        }).get()

        if (!cat_res.data.length) {
          return;
        }
        const _id = cat_res.data[0]._id;
        this.clickCatCard(_id, true);
      }
    }

    // 开始加载页面，获取设置
    var settings = null;
    try {
      settings = await getGlobalSettings('genealogy');
    } catch {
      console.error("get settings error 'genealogy'");
    }
    
    if (!settings) {
      console.log("no setting");
      return
    }
    // 先把设置拿到
    this.jsData.catsStep = settings['catsStep'] || 1;
    // 启动加载
    this.loadFilters(fcampus);

    this.setData({
      main_lower_threshold: settings['main_lower_threshold'],
      adStep: settings['adStep'],
      photoPopWeight: settings['photoPopWeight'] || 10
    });

    // 载入公告信息
    this.newsModal = this.selectComponent("#newsModal");
    await this.loadNews();

    // 设置广告ID
    const ads = await getGlobalSettings('ads') || {};
    this.setData({
      ad: {
        banner: ads.genealogy_banner
      },
    })
  },

  onShow: function () {
    showTab(this);
  },

  loadFilters: async function (fcampus) {
    // 下面开始加载filters
    var res = await loadFilter();
    if (!res) {
      wx.showModal({
        title: '出错了...',
        content: '请到关于页，清理缓存后重启试试~',
        showCancel: false,
      });
      return false;
    }
    var filters = [];
    var area_item = {
      key: 'area',
      cateKey: 'campus',
      name: '校区',
      category: []
    };
    area_item.category.push({
      name: '全部校区',
      items: [], // '全部校区'特殊处理
      all_active: true
    });
    // 用个object当作字典，把area分下类
    var classifier = {};
    for (let i = 0, len = res.campuses.length; i < len; ++i) {
      classifier[res.campuses[i]] = {
        name: res.campuses[i],
        items: [], // 记录属于这个校区的area
        all_active: false
      };
    }
    for (let k = 0, len = res.area.length; k < len; ++k) {
      classifier[res.area[k].campus].items.push(res.area[k]);
    }
    for (let i = 0, len = res.campuses.length; i < len; ++i) {
      area_item.category.push(classifier[res.campuses[i]]);
    }
    // 把初始fcampus写入，例如"011000"
    if (fcampus && fcampus.length === area_item.category.length) {
      console.log("fcampus exist", fcampus, area_item);
      for (let i = 0; i < fcampus.length; i++) {
        const active = fcampus[i] == "1";
        area_item.category[i].all_active = active;
      }
    }
    filters.push(area_item);

    var colour_item = {
      key: 'colour',
      name: '花色',
      category: [{
        name: '全部花色',
        items: res.colour.map(name => {
          return {
            name: name
          };
        }),
        all_active: true
      }]
    }
    filters.push(colour_item);

    var adopt_status = [{
      name: "未知",
      value: null
    }];
    adopt_status = adopt_status.concat(config.cat_status_adopt.map((name, i) => {
      return {
        name: name,
        value: i, // 数据库里存的
      };
    }));

    var adopt_item = {
      key: 'adopt',
      name: '领养',
      category: [{
        name: '全部状态',
        items: adopt_status,
        all_active: true
      }]
    }
    filters.push(adopt_item);

    // 默认把第一个先激活了
    filters[0].active = true;
    console.log(filters);
    this.newUserTip();
    this.setData({
      filters: filters,
    });
    await this.reloadCats();
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
  onReachBottom: async function () {
    await this.loadMoreCats();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    // 分享是保留校区外显filter
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const fcampus = this.getFCampusStr();
    const query = `${path}fcampus=${fcampus}`;
    console.log(query);
    return {
      title: share_text,
      path: query
    };
  },

  // 获取二进制的campus filter字符串
  getFCampusStr: function () {
    var fcampus = [];
    for (var item of this.data.filters[0].category) {
      fcampus.push(item.all_active ? "1" : "0");
    }
    return fcampus.join("");
  },

  onShareTimeline: function () {
    return {
      title: share_text,
      // query: 'cat_id=' + this.data.cat._id
    }
  },

  checkNeedLoad() {
    if (this.data.cats.length >= this.data.catsMax) {
      this.setData({
        loadnomore: true
      });
      this.jsData.pageLoadingLock = false;
      return false;
    }
    return true;
  },

  async reloadCats() {
    // 增加lock
    this.jsData.loadingLock++;
    const nowLoadingLock = this.jsData.loadingLock;
    const db = await cloud.databaseAsync();
    const cat = db.collection('cat');
    const query = await this.fGet();
    const cat_count = (await cat.where(query).count()).total;

    if (this.jsData.loadingLock != nowLoadingLock) {
      // 说明过期了
      return false;
    }
    this.setData({
      cats: [],
      catsMax: cat_count,
      loadnomore: false,
      filters_empty: Object.keys(query).length === 0,
    });
    await Promise.all([
      this.loadMoreCats(),
      // 加载待领养
      this.countWaitingAdopt(),
      // 刷新cache一下
      this.setFCampusCache()
    ]);

    this.unlockBtn();
  },

  // 加载更多的猫猫
  async loadMoreCats() {
    // 加载lock
    const nowLoadingLock = this.jsData.loadingLock;
    if (!this.checkNeedLoad() || this.data.loading) {
      return false;
    }

    await this.setData({
      loading: true,
    });

    var cats = this.data.cats;
    var step = this.jsData.catsStep;
    const db = await cloud.databaseAsync();
    const cat = db.collection('cat');
    const _ = db.command;
    const query = await this.fGet();
    var new_cats = (await cat.where(query).orderBy('mphoto', 'desc').orderBy('popularity', 'desc').skip(cats.length).limit(step).get()).data
    new_cats = shuffle(new_cats);

    if (this.jsData.loadingLock != nowLoadingLock) {
      // 说明过期了
      console.log(`过期了 ${this.jsData.loadingLock}, ${nowLoadingLock}`)
      return false;
    }
    console.log(new_cats);
    for (var d of new_cats) {
      d.photo = default_png;
      d.characteristics_string = [(d.colour || '') + ''].concat(d.characteristics || []).join('，');
      if (!d.mphoto) {
        d.mphoto_new = false;
        continue;
      }

      const today = new Date();
      const modified_date = new Date(d.mphoto);
      const delta_date = today - modified_date; // milliseconds

      // 小于7天
      d.mphoto_new = ((delta_date / 1000 / 3600 / 24) < 7);

      // 是否最近看过了
      const visit_date = getVisitedDate(d._id);
      if (visit_date >= modified_date) {
        d.mphoto_new = false;
      }
    }
    new_cats = cats.concat(new_cats);
    await this.setData({
      cats: new_cats,
      loading: false,
      loadnomore: Boolean(new_cats.length === this.data.catsMax)
    });
    await this.loadCatsPhoto();
  },

  async loadCatsPhoto() {
    // 加载lock
    const nowLoadingLock = this.jsData.loadingLock;

    const cats = this.data.cats;

    var cat2photos = {};
    var cat2commentCount = {};
    for (var cat of cats) {
      if (cat.photo === default_png) {
        cat2photos[cat._id] = await getAvatar(cat._id, cat.photo_count_best);
        if (!cat2photos[cat._id]) {
          continue;
        }
        if (!cat2photos[cat._id].userInfo) {
          cat2photos[cat._id].userInfo = (await getUserInfo(cat2photos[cat._id]._openid)).userInfo;
        }
        cat2commentCount[cat._id] = await getCatCommentCount(cat._id);
      }
    }

    if (this.jsData.loadingLock != nowLoadingLock) {
      console.log("过期了，照片数量：" + cats.length);
      // 说明过期了
      return false;
    }

    // 这里重新获取一遍，因为可能已经刷新了
    var new_cats = this.data.cats;
    for (var c of new_cats) {
      if (cat2photos[c._id]) {
        c.photo = cat2photos[c._id];
        c.comment_count = cat2commentCount[c._id];
      }
    }

    await this.setData({
      cats: new_cats
    });
  },

  bindImageLoaded(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({
      [`cats[${idx}].imageLoaded`]: true
    });
  },

  // 点击猫猫卡片
  clickCatCard(e, isCatId) {
    const cat_id = isCatId ? e : e.currentTarget.dataset.cat_id;
    const index = this.data.cats.findIndex(cat => cat._id == cat_id);
    const detail_url = '/pages/genealogy/detailCat/detailCat';

    if (index != -1) {
      this.setData({
        [`cats[${index}].mphoto_new`]: false
      });
    }

    wx.navigateTo({
      url: detail_url + '?cat_id=' + cat_id,
    });
  },

  // 开始计算各个东西高度
  getHeights() {
    wx.getSystemInfo({
      success: res => {
        // console.log(res);
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
  // 管理员判断，其实可以存到global里
  async bindManageCat(e) {
    var res = await isManagerAsync();
    if (res) {
      const cat_id = e.currentTarget.dataset.cat_id;
      wx.navigateTo({
        url: '/pages/manage/addCat/addCat?cat_id=' + cat_id,
      });
      return;
    }
    console.log("not a manager");
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
  fShow: function () {
    // 这里只管显示和隐藏，类似取消键的功能
    this.setData({
      filters_show: true
    });
  },
  fHide: function () {
    // 这里只管显示和隐藏，类似取消键的功能
    this.setData({
      filters_show: false
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
  fClickCategory: async function (e, singleChoose) {
    console.log(e);
    var filters = this.data.filters;
    var {index, filters_sub} = e.target.dataset;
    if (filters_sub == undefined) {
      filters_sub = this.data.filters_sub;
    }

    const all_active = !filters[filters_sub].category[index].all_active;
    var category = filters[filters_sub].category[index];
    if (index == 0 || singleChoose) { // 默认第0个是'全部'
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
  fGet: async function () {
    const db = await cloud.databaseAsync();
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
            var choice = item.name;
            if (item.value === null) {
              choice = _.exists(false); // 判断字段不存在
            } else if (item.value != undefined) {
              choice = item.value;
            }
            selected.push(choice);
            if (cateFilter && !cateKeyPushed) {
              cateSelected.push(category.name);
              cateKeyPushed = true;
            }
          }
        }
      }

      // console.log(key, selected);
      res.push({
        [key]: _.in(selected)
      });
      if (cateFilter) res.push({
        [cateKey]: _.in(cateSelected)
      });
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
        options: 'is',  // 'g' 在 laf 这边会报错
      });
      res.push(_.or([{
        name: regexp
      }, {
        nickname: regexp
      }]));
    }
    return res.length ? _.and(res) : {};
  },
  fComfirm: function (e) {
    if (!this.data.filters_legal) {
      return false;
    }

    this.lockBtn();

    this.reloadCats();
    this.fHide();
    this.unlockBtn();
  },
  fReset: async function () {
    // 重置所有分类
    var filters = this.data.filters;
    // const filters_sub = this.data.filters_sub;
    for (let sub = 0, len = filters.length; sub < len; ++sub) {
      for (let i = 0, catelen = filters[sub].category.length; i < catelen; ++i) {
        var category = filters[sub].category[i];
        category.all_active = false;
        for (let k = 0, itemlen = category.items.length; k < itemlen; ++k) {
          category.items[k].active = false;
        }
      }
      filters[sub].category[0].all_active = true; // 默认第0个是'全部'
    }

    const fLegal = this.fCheckLegal(filters);
    await this.setData({
      filters: filters,
      filters_legal: fLegal
    });

    // 确认过滤器并关闭展板
    await this.fComfirm();
  },
  // 点击外显的校区
  fClickCampus: async function (e) {
    if (this.jsData.pageLoadingLock) {
      console.log("Page is locked");
      return false;
    }
    await this.fClickCategory(e, true);
    await this.fComfirm();
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
  fSearchClear: async function () {
    await this.setData({
      filters_input: ""
    });
    this.fSearch();
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

  // 查找有多少只猫待领养
  countWaitingAdopt: async function () {
    const target = config.cat_status_adopt_target;
    const value = config.cat_status_adopt.findIndex((x) => {
      return x === target
    });

    const db = await cloud.databaseAsync();
    const cat = db.collection('cat');
    const query = {
      adopt: value
    };

    this.setData({
      adopt_count: (await cat.where(query).count()).total
    });
  },

  // 点击领养按钮
  clickAdoptBtn: async function (e) {
    if (this.jsData.pageLoadingLock) {
      console.log("[点击领养按钮] Page is locking");
      return false;
    }
    this.lockBtn();

    var filters = this.data.filters;
    var filters_sub = filters.findIndex((x) => {
      this.unlockBtn();
      return x.key === "adopt"
    });

    const target_status = config.cat_status_adopt_target;
    const category = filters[filters_sub].category[0];
    const index = category.items.findIndex((x) => {
      return x.name === target_status
    }); // 寻找领养中

    if (category.items[index].active) {
      // 已经激活了
      this.unlockBtn();
      return false;
    }

    category.items[index].active = !category.items[index].active; // 激活状态取反
    filters[filters_sub].category[0].all_active = false; // 取消'全部'的激活，默认第0个是'全部'

    category.all_active = false; // 直接反激活category

    const fLegal = this.fCheckLegal(filters);
    this.setData({
      filters: filters,
      filters_legal: fLegal
    });

    await Promise.all([
      this.reloadCats(),
      this.showFilterTip()
    ])
    this.unlockBtn();
  },

  // 显示过滤器的提示
  async showFilterTip() {
    await this.setData({
      show_filter_tip: true
    });
    await sleep(6000);
    await this.setData({
      show_filter_tip: false
    });
  },

  newUserTip() {
    const key = "newUserTip";
    var lastTime = wx.getStorageSync(key);

    if (lastTime != undefined && getDeltaHours(lastTime) < tipInterval) {
      // 刚提示没多久
      return false;
    }

    // 显示提示
    this.showFilterTip();

    // 写入时间
    wx.setStorageSync(key, new Date());
  },

  // 返回首页
  async clickBackFirstPageBtn() {
    if (this.jsData.pageLoadingLock) {
      console.log("[返回首页] page is locked");
      return false;
    }

    this.lockBtn();

    await this.fReset();
    await this.fSearchClear();
    this.unlockBtn();
  },

  async loadNews() {
    if (!await checkCanShowNews()) {
      return;
    }
    // 载入需要弹窗的公告
    const db = await cloud.databaseAsync();
    var newsList = (await db.collection('news').orderBy('date', 'desc').where({
      setNewsModal: true
    }).get()).data

    this.setData({
      newsList: newsList,
    });
    console.log("公告弹出模块: ", this.data.newsList);
    if (newsList.length == 0) {
      return;
    }

    if (newsList[0].coverPath) {
      this.setData({
        newsImage: newsList[0].coverPath
      })
    } else if (newsList[0].photosPath.length != 0) {
      this.setData({
        newsImage: newsList[0].photosPath[0]
      })
    }
    if (!this.checkNewsVisited()) {
      this.newsModal.showNewsModal();
    }
  },

  // 取消事件
  _cancelEvent() {
    this.newsModal.hideNewsModal();
    this.setNewsVisited();
  },
  // 确认事件: 查看公告详情
  _confirmEvent() {
    this.newsModal.hideNewsModal();
    this.setNewsVisited();
    const news_id = this.data.newsList[0]._id;
    const detail_url = '/pages/news/detailNews/detailNews';
    wx.navigateTo({
      url: detail_url + '?news_id=' + news_id,
    });
  },
  // 检测公告是否已读
  checkNewsVisited() {
    const news_id = this.data.newsList[0]._id;
    var key = `visit-news-${news_id}`;
    var visited = cache.getCacheItem(key);
    // console.log(visited);
    return visited;
  },
  // 设置已读时间
  setNewsVisited() {
    const news_id = this.data.newsList[0]._id;
    var key = `visit-news-${news_id}`;
    cache.setCacheItem(key, true, cache.cacheTime.genealogyNews);
  },

  // 上锁
  lockBtn() {
    // console.log("lock");
    this.jsData.pageLoadingLock = true;
  },
  // 解锁
  unlockBtn() {
    // console.log("unlock");
    this.jsData.pageLoadingLock = false;
  },

  // campus过滤器cache起来
  setFCampusCache: function () {
    const fc = this.getFCampusStr();
    cache.setCacheItem("genealogy-fcampus", fc, cache.cacheTime.genealogyFCampus);
  },

  // campus过滤器取cache
  getFCampusCache: function () {
    return cache.getCacheItem("genealogy-fcampus");
  }
})