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
import { signCosUrl } from "../../utils/common";

const default_png = undefined;
const tipInterval = 24; // 提示间隔时间 hours
const share_text = config.text.app_name + ' - ' + config.text.genealogy.share_tip;
const app = getApp();

Page({
  data: {
    cats: [],
    filters: [],
    filters_sub: 0,
    filters_legal: true,
    filters_show: false,
    filters_input: '',
    filters_show_shadow: false,
    filters_empty: true,
    heights: { filters: 40 },
    catsMax: 0,
    loading: false,
    loadnomore: false,
    adopt_desc: config.cat_status_adopt,
    adopt_count: 0,
    ad_show: {},
    ad: {},
    newsList: [],
    newsImage: "",
    text_cfg: config.text,
    // 新增：数据加载完成标志
    dataReady: false
  },

  jsData: {
    catsStep: 1,
    loadingLock: 0,
    pageLoadingLock: false,
    // 新增：待处理的scene参数
    pendingScene: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (!this.jsData) {
      this.jsData = {
        catsStep: 1,
        loadingLock: 0,
        pageLoadingLock: false,
        pendingScene: null
      };
    }
    
    // 保存scene参数，但不立即处理
    if (options.scene) {
      const scene = decodeURIComponent(options.scene);
      console.log("scene:", scene);
      if (scene.startsWith('toC=')) {
        this.jsData.pendingScene = scene;
      }
    }

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

    // 开始加载页面，获取设置
    var settings = null, retrySettings = 3;
    while (retrySettings > 0) {
      try {
        settings = await getGlobalSettings('genealogy', { nocache: true });
        break;
      } catch {
        console.error("get settings error 'genealogy'");
        retrySettings--;
        if (retrySettings <= 0) {
          break;
        }
        await sleep(1000);
      }
    }

    if (!settings) {
      console.log("no setting");
      wx.showModal({
        title: '网络小故障',
        content: '请重新进入小程序',
        showCancel: false,
        success() {
          const pagesStack = getCurrentPages();
          const path = getCurrentPath(pagesStack);
          wx.restartMiniProgram({
            path
          });
        }
      })
      return
    }
    
    // 先把设置拿到
    this.jsData.catsStep = settings['catsStep'] || 1;
    
    // 启动加载
    await Promise.all([
      this.loadRecognize(),
      this.loadFilters(fcampus),
    ]);

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

    // 添加事件监听
    app.globalData.eventBus.$on('photoProcessed', this.handlePhotoProcessed);
    
    // 标记数据加载完成
    this.setData({ dataReady: true });
    
    // 处理待处理的scene参数
    if (this.jsData.pendingScene) {
      this.handlePendingScene();
    }
  },
  
  // 新增：处理待处理的scene参数
  async handlePendingScene() {
    const scene = this.jsData.pendingScene;
    if (scene.startsWith('toC=')) {
      const cat_No = scene.substr(4);
      // 使用正确的字段名 'no' 而不是 '_no'
      const { result: cat_res } = await app.mpServerless.db.collection('cat').find({ no: cat_No }, { projection: { _id: 1 } });
      
      if (!cat_res.length) {
        wx.showToast({
          title: '未找到对应猫咪',
          icon: 'none'
        });
        return;
      }
      const _id = cat_res[0]._id;
      this.clickCatCard(_id, true);
    }
    this.jsData.pendingScene = null;
  },

  onUnload: function () {
    app.globalData.eventBus.$off('photoProcessed', this.handlePhotoProcessed);
  },

  handlePhotoProcessed: function (data) {
    if (data.catId) {
      this.refreshCatData(data.catId);
    } else {
      this.reloadCats();
    }
  },

  refreshCatData: async function (catId) {
    const index = this.data.cats.findIndex(cat => cat._id === catId);
    if (index === -1) return;
    
    const { result: [updatedCat] } = await app.mpServerless.db.collection('cat').find({ 
      _id: catId 
    });
    
    if (updatedCat) {
      this.setData({ [`cats[${index}]`]: updatedCat });
      this.loadCatPhoto(updatedCat, index);
    }
  },

  loadCatPhoto: async function (cat, index) {
    const photo = await getAvatar(cat._id, cat.photo_count_best);
    if (!photo) return;
    
    if (!photo.userInfo) {
      photo.userInfo = (await getUserInfo(photo._openid)).userInfo;
    }
    
    const commentCount = await getCatCommentCount(cat._id);
    
    this.setData({
      [`cats[${index}].photo`]: photo,
      [`cats[${index}].comment_count`]: commentCount
    });
  },

  onShow: function () {
    showTab(this);
  },

  loadRecognize: async function () {
    const env = __wxConfig.envVersion === 'release' ? 'recognize' : 'recognize_test';
    const settings = await getGlobalSettings(env);
    this.setData({
      showRecognize: settings.interfaceURL && !settings.interfaceURL.includes("https://your.domain.com")
    });
  },

  loadFilters: async function (fcampus) {
    const res = await loadFilter();
    if (!res) {
      wx.showModal({
        title: '出错了...',
        content: '请到关于页，清理缓存后重启试试~',
        showCancel: false,
      });
      return false;
    }
    
    const filters = [];
    
    // 校区过滤器
    const area_item = {
      key: 'area',
      cateKey: 'campus',
      name: '校区',
      category: [{
        name: '全部校区',
        items: [],
        all_active: true
      }]
    };
    
    const classifier = {};
    res.campuses.forEach(campus => {
      classifier[campus] = {
        name: campus,
        items: [],
        all_active: false
      };
    });
    
    res.area.forEach(area => {
      if (classifier[area.campus]) {
        classifier[area.campus].items.push(area);
      }
    });
    
    Object.values(classifier).forEach(category => {
      area_item.category.push(category);
    });
    
    if (fcampus && fcampus.length === area_item.category.length) {
      fcampus.split('').forEach((activeFlag, i) => {
        if (area_item.category[i]) {
          area_item.category[i].all_active = activeFlag === "1";
        }
      });
    }
    
    filters.push(area_item);
    
    // 花色过滤器
    const colour_item = {
      key: 'colour',
      name: '花色',
      category: [{
        name: '全部花色',
        items: res.colour.map(name => ({ name })),
        all_active: true
      }]
    };
    filters.push(colour_item);
    
    // 领养状态过滤器
    const adopt_status = [{ name: "未知", value: null }];
    config.cat_status_adopt.forEach((name, i) => {
      adopt_status.push({ name, value: i });
    });
    
    const adopt_item = {
      key: 'adopt',
      name: '领养',
      category: [{
        name: '全部状态',
        items: adopt_status,
        all_active: true
      }]
    };
    filters.push(adopt_item);
    
    // 设置默认激活的过滤器
    filters[0].active = true;
    
    this.newUserTip();
    this.setData({ filters });
    
    // 确保加载猫咪数据
    await this.reloadCats();
  },

  onReady: function () {
    this.getHeights();
  },

  onReachBottom: async function () {
    await this.loadMoreCats();
  },

  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const fcampus = this.getFCampusStr();
    const query = `${path}fcampus=${fcampus}`;
    return {
      title: share_text,
      path: query
    };
  },

  getFCampusStr: function () {
    return this.data.filters[0].category
      .map(item => item.all_active ? "1" : "0")
      .join("");
  },

  onShareTimeline: function () {
    return { title: share_text };
  },

  checkNeedLoad() {
    if (this.data.cats.length >= this.data.catsMax) {
      this.setData({ loadnomore: true });
      this.jsData.pageLoadingLock = false;
      return false;
    }
    return true;
  },

  async reloadCats() {
    this.jsData.loadingLock++;
    const nowLoadingLock = this.jsData.loadingLock;
    
    const query = await this.fGet();
    const { result: cat_count } = await app.mpServerless.db.collection('cat').count(query);
    
    if (this.jsData.loadingLock !== nowLoadingLock) return false;
    
    this.setData({
      cats: [],
      catsMax: cat_count,
      loadnomore: false,
      filters_empty: Object.keys(query).length === 0,
    });
    
    await Promise.all([
      this.loadMoreCats(),
      this.countWaitingAdopt(),
      this.setFCampusCache()
    ]);
    
    this.unlockBtn();
  },

  async loadMoreCats() {
    const nowLoadingLock = this.jsData.loadingLock;
    if (!this.checkNeedLoad() || this.data.loading) return false;
    
    await this.setData({ loading: true });
    
    const cats = this.data.cats;
    const step = this.jsData.catsStep;
    const query = await this.fGet();
    
    let { result: new_cats } = await app.mpServerless.db.collection('cat').find(query, { 
      sort: { mphoto: -1, popularity: -1 }, 
      skip: cats.length, 
      limit: step 
    });
    
    new_cats = shuffle(new_cats);
    
    if (this.jsData.loadingLock !== nowLoadingLock) return false;
    
    const today = new Date();
    new_cats.forEach(d => {
      d.photo = default_png;
      d.characteristics_string = [(d.colour || '') + ''].concat(d.characteristics || []).join('，');
      
      if (d.mphoto) {
        const modified_date = new Date(d.mphoto);
        const delta_days = (today - modified_date) / (1000 * 3600 * 24);
        d.mphoto_new = delta_days < 7;
        
        const visit_date = getVisitedDate(d._id);
        if (visit_date >= modified_date) {
          d.mphoto_new = false;
        }
      } else {
        d.mphoto_new = false;
      }
    });
    
    const updatedCats = [...cats, ...new_cats];
    await this.setData({
      cats: updatedCats,
      loading: false,
      loadnomore: updatedCats.length === this.data.catsMax
    });
    
    await this.loadCatsPhoto();
  },

  async loadCatsPhoto() {
    const nowLoadingLock = this.jsData.loadingLock;
    const cats = this.data.cats;
    
    const cat2photos = {};
    const cat2commentCount = {};
    
    await Promise.all(cats.map(async cat => {
      if (cat.photo === default_png) {
        const photo = await getAvatar(cat._id, cat.photo_count_best);
        if (photo) {
          if (!photo.userInfo) {
            try {
              const userInfoRes = await getUserInfo(photo._openid);
              photo.userInfo = userInfoRes.userInfo;
            } catch (e) {
              console.error("获取用户信息失败:", e);
            }
          }
          cat2photos[cat._id] = photo;
          cat2commentCount[cat._id] = await getCatCommentCount(cat._id);
        }
      }
    }));
    
    if (this.jsData.loadingLock !== nowLoadingLock) return false;
    
    const updatedCats = cats.map(c => {
      if (cat2photos[c._id]) {
        return {
          ...c,
          photo: cat2photos[c._id],
          comment_count: cat2commentCount[c._id]
        };
      }
      return c;
    });
    
    this.setData({ cats: updatedCats });
  },

  bindImageLoaded(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ [`cats[${idx}].imageLoaded`]: true });
  },

  clickRecognize(e) {
    wx.navigateTo({ url: '/pages/packageA/pages/recognize/recognize' });
  },

  clickCatCard(e, isCatId) {
    const cat_id = isCatId ? e : e.currentTarget.dataset.cat_id;
    const index = this.data.cats.findIndex(cat => cat._id == cat_id);
    
    if (index !== -1) {
      this.setData({ [`cats[${index}].mphoto_new`]: false });
    }
    
    wx.navigateTo({
      url: `/pages/genealogy/detailCat/detailCat?cat_id=${cat_id}`,
    });
  },

  getHeights() {
    wx.getSystemInfo({
      success: res => {
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

  async bindManageCat(e) {
    if (await isManagerAsync()) {
      const cat_id = e.currentTarget.dataset.cat_id;
      wx.navigateTo({
        url: `/pages/manage/catManage/catManage?cat_id=${cat_id}&activeTab=info`,
      });
    }
  },

  // 过滤器相关函数
  voidMove: function () { },
  
  fToggle: function () {
    this.setData({ filters_show: !this.data.filters_show });
  },
  
  fShow: function () {
    this.setData({ filters_show: true });
  },
  
  fHide: function () {
    this.setData({ filters_show: false });
  },
  
  fClickMain: function (e) {
    const filters = this.data.filters.map((f, i) => ({
      ...f,
      active: i === e.currentTarget.dataset.index
    }));
    
    this.setData({
      filters,
      filters_sub: e.currentTarget.dataset.index
    });
  },
  
  fClickCategory: async function (e, singleChoose) {
    const filters = [...this.data.filters];
    let filters_sub = e.target.dataset.filters_sub;
    if (filters_sub === undefined) filters_sub = this.data.filters_sub;
    
    const index = e.target.dataset.index;
    const category = filters[filters_sub].category[index];
    const all_active = !category.all_active;
    
    if (index === 0 || singleChoose) {
      filters[filters_sub].category.forEach((ctg, i) => {
        ctg.all_active = i === index ? all_active : false;
        ctg.items.forEach(item => { item.active = false; });
      });
    } else {
      filters[filters_sub].category[0].all_active = false;
      category.all_active = all_active;
      category.items.forEach(item => { item.active = false; });
    }
    
    this.setData({
      filters,
      filters_legal: this.fCheckLegal(filters)
    });
  },
  
  fClickSub: function (e) {
    const filters = [...this.data.filters];
    const filters_sub = this.data.filters_sub;
    const categoryIndex = e.target.dataset.index;
    const itemIndex = e.target.dataset.innerindex;
    
    const category = filters[filters_sub].category[categoryIndex];
    category.items[itemIndex].active = !category.items[itemIndex].active;
    category.all_active = false;
    
    if (categoryIndex !== 0) {
      filters[filters_sub].category[0].all_active = false;
    }
    
    this.setData({
      filters,
      filters_legal: this.fCheckLegal(filters)
    });
  },
  
  fCheckLegal: function (filters) {
    for (const mainF of filters) {
      if (mainF.category[0].all_active) continue;
      
      let count = 0;
      for (const category of mainF.category) {
        if (category.all_active) {
          count += category.items.length;
        } else {
          count += category.items.filter(item => item.active).length;
        }
      }
      
      if (count === 0) return false;
    }
    return true;
  },
  
  fGet: async function() {
    const filters = this.data.filters;
    const conditions = [];
    
    // 处理选择的过滤器
    filters.forEach(mainF => {
      if (mainF.category[0].all_active) return;
      
      const selected = [];
      let cateSelected = [];
      const cateFilter = Boolean(mainF.cateKey);
      
      mainF.category.forEach(category => {
        let cateKeyPushed = false;
        
        category.items.forEach(item => {
          if (category.all_active || item.active) {
            let choice = item.name;
            if (item.value === null) choice = { $type: "missing" };
            else if (item.value !== undefined) choice = item.value;
            
            selected.push(choice);
            
            if (cateFilter && !cateKeyPushed) {
              cateSelected.push(category.name);
              cateKeyPushed = true;
            }
          }
        });
      });
      
      if (selected.length > 0) {
        conditions.push({ [mainF.key]: { $in: selected } });
        if (cateFilter && cateSelected.length > 0) {
          conditions.push({ [mainF.cateKey]: { $in: cateSelected } });
        }
      }
    });
    
    // 处理搜索输入
    const filters_input = regReplace(this.data.filters_input);
    if (filters_input) {
      const searchTerms = filters_input.trim().split(' ');
      const regexPattern = searchTerms.map(term => `.*${term}.*`).join('|');
      
      conditions.push({
        $or: [
          { name: { $regex: regexPattern } },
          { nickname: { $regex: regexPattern } }
        ]
      });
    }
    
    this.setData({ filters_active: conditions.length > 0 });
    return conditions.length > 0 ? { $and: conditions } : {};
  },
  
  fComfirm: function() {
    if (!this.data.filters_legal) return false;
    
    this.lockBtn();
    this.reloadCats();
    this.fHide();
    this.unlockBtn();
  },
  
  fReset: async function() {
    const filters = this.data.filters.map(mainF => ({
      ...mainF,
      category: mainF.category.map(category => ({
        ...category,
        all_active: category.name.includes('全部'),
        items: category.items.map(item => ({ ...item, active: false }))
      }))
    }));
    
    this.setData({
      filters,
      filters_legal: this.fCheckLegal(filters)
    });
    
    await this.fComfirm();
  },
  
  fClickCampus: async function(e) {
    if (this.jsData.pageLoadingLock) return false;
    await this.fClickCategory(e, true);
    await this.fComfirm();
  },
  
  fSearchInput: function(e) {
    this.setData({ filters_input: e.detail.value });
  },
  
  fSearch: function() {
    this.reloadCats();
  },
  
  fSearchClear: async function() {
    await this.setData({ filters_input: "" });
    this.fSearch();
  },
  
  fScroll: function(e) {
    const scrollTop = e.detail.scrollTop;
    const showShadow = scrollTop >= 50;
    if (this.data.filters_show_shadow !== showShadow) {
      this.setData({ filters_show_shadow: showShadow });
    }
  },

  // 广告相关
  changeState(ad_id, show) {
    const ad_show = { ...this.data.ad_show, [ad_id]: show };
    this.setData({ ad_show });
  },

  adLoad(e) {
    this.changeState(e.currentTarget.dataset.ad_id, true);
  },
  
  adError(e) {
    this.changeState(e.currentTarget.dataset.ad_id, false);
  },
  
  adClose(e) {
    this.changeState(e.currentTarget.dataset.ad_id, false);
  },

  async countWaitingAdopt() {
    const target = config.cat_status_adopt_target;
    const value = config.cat_status_adopt.indexOf(target);
    const { result: adopt_count } = await app.mpServerless.db.collection('cat').count({ adopt: value });
    this.setData({ adopt_count });
  },

  async clickAdoptBtn() {
    if (this.jsData.pageLoadingLock) return false;
    this.lockBtn();
    
    const filters = [...this.data.filters];
    const filters_sub = filters.findIndex(f => f.key === "adopt");
    if (filters_sub === -1) {
      this.unlockBtn();
      return false;
    }
    
    const target_status = config.cat_status_adopt_target;
    const category = filters[filters_sub].category[0];
    const index = category.items.findIndex(item => item.name === target_status);
    
    if (index === -1 || category.items[index].active) {
      this.unlockBtn();
      return false;
    }
    
    category.items[index].active = true;
    category.all_active = false;
    filters[filters_sub].category[0].all_active = false;
    
    this.setData({
      filters,
      filters_legal: this.fCheckLegal(filters)
    });
    
    await Promise.all([this.reloadCats(), this.showFilterTip()]);
    this.unlockBtn();
  },

  async showFilterTip() {
    this.setData({ show_filter_tip: true });
    await sleep(6000);
    this.setData({ show_filter_tip: false });
  },

  newUserTip() {
    const key = "newUserTip";
    const lastTime = wx.getStorageSync(key);
    if (lastTime && getDeltaHours(lastTime) < tipInterval) return;
    
    this.showFilterTip();
    wx.setStorageSync(key, new Date());
  },

  async clickBackFirstPageBtn() {
    if (this.jsData.pageLoadingLock) return false;
    this.lockBtn();
    await this.fReset();
    await this.fSearchClear();
    this.unlockBtn();
  },

  async loadNews() {
    if (!await checkCanShowNews()) return;
    
    const { result: newsList } = await app.mpServerless.db.collection('news').find({ 
      setNewsModal: true 
    }, { sort: { date: -1 } });
    
    this.setData({ newsList });
    if (!newsList.length) return;
    
    let newsImage = "";
    if (newsList[0].coverPath) {
      newsImage = await signCosUrl(newsList[0].coverPath);
    } else if (newsList[0].photosPath?.length) {
      newsImage = await signCosUrl(newsList[0].photosPath[0]);
    }
    
    this.setData({ newsImage });
    
    if (!this.checkNewsVisited()) {
      this.newsModal.showNewsModal();
    }
  },

  _cancelEvent() {
    this.newsModal.hideNewsModal();
    this.setNewsVisited();
  },
  
  _confirmEvent() {
    this.newsModal.hideNewsModal();
    this.setNewsVisited();
    wx.navigateTo({
      url: `/pages/news/detailNews/detailNews?news_id=${this.data.newsList[0]._id}`,
    });
  },
  
  checkNewsVisited() {
    const news_id = this.data.newsList[0]?._id;
    return news_id ? cache.getCacheItem(`visit-news-${news_id}`) : false;
  },
  
  setNewsVisited() {
    const news_id = this.data.newsList[0]?._id;
    if (news_id) {
      cache.setCacheItem(`visit-news-${news_id}`, true, cache.cacheTime.genealogyNews);
    }
  },

  lockBtn() {
    this.jsData.pageLoadingLock = true;
  },
  
  unlockBtn() {
    this.jsData.pageLoadingLock = false;
  },

  setFCampusCache: function() {
    const fc = this.getFCampusStr();
    cache.setCacheItem("genealogy-fcampus", fc, cache.cacheTime.genealogyFCampus);
  },

  getFCampusCache: function() {
    return cache.getCacheItem("genealogy-fcampus");
  }
})