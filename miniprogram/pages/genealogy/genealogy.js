import {
  shuffle,
  regReplace,
  getDeltaHours,
  sleep,
  getCurrentPath
} from "../../utils/utils";
import {
  getAvatar,
  getCatItem,
  getVisitedDate
} from "../../utils/cat";
import {
  getCatCommentCount
} from "../../utils/comment";
import { getUserInfo } from "../../utils/user";
import cache from "../../utils/cache";
import config from "../../config";
import { loadFilter, getGlobalSettings, showTab } from "../../utils/page";
import { isManagerAsync, checkCanShowNews, checkCanUpload, checkCanComment } from "../../utils/user";
import { signCosUrl } from "../../utils/common";

const tipInterval = 24; // 提示间隔时间 hours
const share_text = config.text.app_name + ' - ' + config.text.genealogy.share_tip;
const app = getApp();

Page({
  data: {
    cats: [],
    filters: [],
    filters_sub: 0,
    filters_show: false,
    filters_tab_counts: [],
    campus_on: [],
    // 自定义导航栏：尺寸变量（挂在根节点）、折叠参数（给 collapseNav.wxs）、筛选卡片起点
    navVars: '',
    navM: {},
    filterTop: 0,
    // 搜索：filters_input 是输入框里的文字，filters_search 是已生效的搜索词（查询、翻页只看它）。
    // 按键盘搜索键才生效；没按就收起键盘，输入框恢复成已生效的搜索词
    filters_input: '',
    filters_search: '',
    // 每次重新加载列表时加 1，交给 collapseNav.wxs：列表回到顶部，搜索栏随之展开
    navReset: 0,
    filters_empty: true,
    filters_count: 0,
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
    // 卡片展开：当前展开的卡片索引，-1 表示无；展开后加 wide 样式、滚动到顶部、显示动作按钮
    expandedCatIndex: -1,
    // scroll-view 的 scroll-top，展开时计算带余量的目标值平滑滚动，避免顶部被遮挡
    targetScrollTop: 0,
    // 是否管理员（控制展开卡片右上角"管理"按钮显示）
    isManager: false,
    // 功能开关：是否可上传照片 / 是否可使用便利贴墙（由 pageSettings 决定）
    canUpload: true,
    canComment: true
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

    this.initNavMetrics();
    
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
          wx.reLaunch({
            url: '/pages/genealogy/genealogy'
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

    // 检查管理员身份（控制展开卡片"管理"按钮显示）
    // 同时检查上传照片和便利贴墙功能是否对当前用户开放
    try {
      const [isManager, canUpload, canComment] = await Promise.all([
        isManagerAsync(),
        checkCanUpload(),
        checkCanComment(),
      ]);
      this.setData({ isManager: !!isManager, canUpload: !!canUpload, canComment: !!canComment });
    } catch (e) {
      console.warn('检查用户权限失败:', e.message);
    }

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
      const { result: cat_res } = await app.mpServerless.db.collection('cat').find({ _no: cat_No, deleted: { $ne: 1 } }, { projection: { _id: 1 } });
      
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
      _id: catId, 
      deleted: { $ne: 1 } 
    });
    
    if (updatedCat) {
      // 清除该猫的图片尺寸缓存，使 bindImageLoaded 重新计算 panDistance
      if (this.jsData.imageSizeMap) delete this.jsData.imageSizeMap[catId];
      this.setData({ [`cats[${index}]`]: updatedCat });
      this.loadCatPhoto(updatedCat, index);
    }
  },

  loadCatPhoto: async function (cat, index) {
    const photo = await getAvatar(cat._id, { bestOnly: true });
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
    const settings = await getGlobalSettings('recognize');
    const showRecognize = settings && settings.showRecognizeBtn === true;
    this.setData({ showRecognize: !!showRecognize });
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
    
    // advance版状态过滤器
    const status_item = {
      key: 'status',
      name: '状态',
      category: [
        { name: '全部状态', items: [], all_active: true },
        {
          name: '领养状态',
          items: [
            { name: "未知", value: null },
            ...config.cat_status_adopt.map((name, i) => ({ name: name, value: i }))
          ],
          all_active: false
        },
        {
          name: '绝育状态',
          items: [
            { name: '待绝育', value: false },
            { name: '已绝育', value: true }
          ],
          all_active: false
        },
        {
          name: '其他',
          items: [
            { name: '未失踪', value: { field: 'missing', condition: false } },
            { name: '已失踪', value: { field: 'missing', condition: true } },
            { name: '去往喵星', value: { field: 'to_star', condition: true } }
          ],
          all_active: false
        }
      ],
      active: false
    };
    filters.push(status_item);
    
    // 设置默认激活的过滤器
    filters[0].active = true;
    
    this.newUserTip();
    this.setData({ filters });
    
    // 确保加载猫咪数据
    await this.reloadCats();
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
    
    // 重置图片尺寸缓存，避免同尺寸图片被防重入跳过导致 panDistance 不重新计算
    this.jsData.imageSizeMap = {};

    this.setData({
      cats: [],
      expandedCatIndex: -1,
      // 列表清空后自然回到顶部（scroll-top 可能本来就是 0、不会触发滚动事件），通知搜索栏展开
      targetScrollTop: 0,
      navReset: this.data.navReset + 1,
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
      d.photo = undefined; // 首图稍后由 loadCatPhoto 按需拉取
      // 卡片上花色单独成胶囊，特征行只放其余描述
      d.traits_string = [].concat(d.characteristics || []).filter(Boolean).join('，'); // 可能是数组也可能是字符串
      
      if (d.mphoto) {
        const modified_date = new Date(d.mphoto);
        const delta_days = (today - modified_date) / (1000 * 3600 * 24);
        d.mphoto_new = delta_days < 7;
        d.mphoto_ago = delta_days < 1 ? '今天' : delta_days < 2 ? '昨天' : `${Math.floor(delta_days)} 天前`;
        
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
      if (cat.photo === undefined) {
        const photo = await getAvatar(cat._id, { bestOnly: true });
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
    
    // 路径式更新：只更新有新照片的猫项，避免全量 setData 触发整个 wx:for 重 diff，
    // 否则现有猫 image 的 class/style 会被重新应用，CSS animation 重启导致照片闪动
    const updates = {};
    let hasUpdate = false;
    cats.forEach((c, i) => {
      if (cat2photos[c._id]) {
        updates[`cats[${i}].photo`] = cat2photos[c._id];
        updates[`cats[${i}].comment_count`] = cat2commentCount[c._id];
        hasUpdate = true;
      }
    });
    if (hasUpdate) {
      this.setData(updates);
    }
  },

  bindImageLoaded(e) {
    const idx = e.currentTarget.dataset.index;
    const detail = e && e.detail;
    const cat = this.data.cats[idx];

    // 防重入：同一只猫、同一尺寸的图片已处理过则跳过，
    // 避免下拉加载时 image 重新触发 bindload 导致重复 setData，CSS animation 重启闪动
    if (cat && detail && detail.width && detail.height) {
      if (!this.jsData.imageSizeMap) this.jsData.imageSizeMap = {};
      const last = this.jsData.imageSizeMap[cat._id];
      if (last && last.w === detail.width && last.h === detail.height) {
        return;
      }
      this.jsData.imageSizeMap[cat._id] = { w: detail.width, h: detail.height };
    }

    const update = { [`cats[${idx}].imageLoaded`]: true };
    if (detail && detail.width && detail.height) {
      try {
        const sysInfo = wx.getWindowInfo();
        const rpxToPx = sysInfo.windowWidth / 750;
        // 滚动仅作用于展开（wide）卡片：宽 700rpx、图高 500rpx；
        // widthFix 模式下图片按 700rpx 宽等比缩放，超出 500rpx 的部分即需移动距离
        const containerWidthPx = 700 * rpxToPx;
        const containerHeightPx = 500 * rpxToPx;
        const scaledHeight = detail.height * (containerWidthPx / detail.width);
        const distance = Math.max(0, scaledHeight - containerHeightPx);
        update[`cats[${idx}].panDistance`] = Math.round(distance);
        if (distance > 0) {
          update[`cats[${idx}].panDuration`] = Math.min(12, Math.max(3, Math.round(distance / 30)));
        }
      } catch (err) {
        console.warn('计算卡片照片移动距离失败:', err.message);
      }
    }
    this.setData(update);
  },

  clickRecognize(e) {
    wx.navigateTo({ url: '/pages/packageA/pages/recognize/recognize' });
  },

  clickCatCard(e, isCatId) {
    const cat_id = isCatId ? e : e.currentTarget.dataset.cat_id;
    const index = this.data.cats.findIndex(cat => cat._id == cat_id);

    // scene 深链（isCatId=true）直接跳详情，不走展开（无列表数据，不带首屏缓存）
    if (isCatId) {
      this.toDetailPage(cat_id);
      return;
    }

    if (index === -1) return;
    this.toggleExpand(index);
  },

  // 展开/收起卡片：展开时加 wide 样式 + 平滑滚动到顶部 + 显示动作按钮；再次点击进入详情相册
  toggleExpand(index) {
    if (this.data.expandedCatIndex === index) {
      // 再次点击同一张展开卡片 → 进入详情相册（带列表数据做首屏秒开）
      const cat = this.data.cats[index];
      if (cat) {
        this.toDetailPage(cat._id, cat);
      }
      return;
    }
    // 展开新卡片（自动收起旧的）
    this.setData({ expandedCatIndex: index });

    // 计算带余量的 scrollTop：用 selectorQuery 获取 card 相对 scroll-view 的位置，
    // 减去顶部余量（40rpx），避免 card 顶部贴 scroll-view 顶部过近被上方 #search 阴影遮挡
    wx.nextTick(() => {
      const query = wx.createSelectorQuery();
      query.select('#card-' + index).boundingClientRect();
      query.select('.cards').scrollOffset();
      query.select('.cards').boundingClientRect();
      query.exec(res => {
        if (!res || !res[0] || !res[1] || !res[2]) return;
        const cardRect = res[0];        // card 相对视口的位置
        const scrollInfo = res[1];      // scroll-view 当前 scrollTop
        const svRect = res[2];          // scroll-view 相对视口的位置
        // card 在 scroll-view 内容流中的偏移
        const cardOffsetTop = cardRect.top - svRect.top + scrollInfo.scrollTop;
        // 卡片停在「滚到位后」顶部遮挡的下沿往下 24rpx：滚到位后搜索栏收起则遮到导航栏下沿，展开则到搜索栏下沿
        const rpxToPx = wx.getWindowInfo().windowWidth / 750;
        const { navOn, navOff, navBottom, searchBottom, navCollapsed } = this.jsData;
        let targetScrollTop = Math.max(0, cardOffsetTop - 24 * rpxToPx - searchBottom);
        if (targetScrollTop > navOn || (navCollapsed && targetScrollTop >= navOff)) {
          targetScrollTop = Math.max(0, cardOffsetTop - 24 * rpxToPx - navBottom);
        }
        this.setData({ targetScrollTop });
      });
    });
  },

  // 跳转详情页：cat 存在时先写入 globalData，详情页 onLoad 同步读取、立即渲染首屏，
  // 再由 loadCat 从数据库拉全量数据刷新；写操作很小，不影响跳转动画
  toDetailPage(cat_id, cat) {
    app.globalData.pendingCatDetail = cat ? { cat, ts: Date.now() } : null;
    wx.navigateTo({ url: `/pages/genealogy/detailCat/detailCat?cat_id=${cat_id}` });
  },

  // 展开卡片"猫猫详情"按钮
  clickDetailBtn(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    if (!cat_id) return;
    // 点击"猫猫详情"后才消除"新图"标签；卡片保持展开，返回时无需重新点开
    const index = this.data.cats.findIndex(cat => cat._id == cat_id);
    if (index !== -1) {
      this.setData({ [`cats[${index}].mphoto_new`]: false });
    }
    this.toDetailPage(cat_id, this.data.cats[index]);
  },

  // 展开卡片"上传喵照"按钮（卡片保持展开）
  clickUploadBtn(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    if (!cat_id) return;
    wx.navigateTo({ url: `/pages/genealogy/addPhoto/addPhoto?cat_id=${cat_id}` });
  },

  // 展开卡片"便利贴墙"按钮（卡片保持展开）
  clickCommentBtn(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    if (!cat_id) return;
    wx.navigateTo({ url: `/pages/genealogy/commentBoard/commentBoard?cat_id=${cat_id}` });
  },

  // 展开卡片"管理"按钮（右上角，仅管理员可见；卡片保持展开）
  async clickManageBtn(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    if (!cat_id) return;
    if (!(await isManagerAsync())) return;
    wx.navigateTo({ url: `/pages/manage/catManage/catManage?cat_id=${cat_id}&activeTab=info` });
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

  // 打开时记下当前筛选，点蒙层或再点筛选按钮收起时还原，只有「完成」才应用
  fToggle: function () {
    if (this.data.filters_show) this.fCancel();
    else this.fShow();
  },

  // 卡片与按钮、蒙层同一次更新出现，过渡同时开始。位置按搜索栏最终状态直接算：收起时导航栏下沿、展开时搜索栏下沿，再往下 16rpx
  fShow: function () {
    this.jsData.filtersSnapshot = JSON.parse(JSON.stringify(this.data.filters));
    const { navCollapsed, navBottom, searchBottom } = this.jsData;
    const rpx = wx.getWindowInfo().windowWidth / 750;
    const filterTop = Math.round((navCollapsed ? navBottom : searchBottom) + 16 * rpx);
    this.setFilters(this.data.filters, { filters_show: true, filterTop });
  },

  // collapseNav.wxs 回报搜索栏最终是否收起
  onNavState: function ({ collapsed }) {
    this.jsData.navCollapsed = collapsed;
  },

  // 胶囊位置因机型而异，只能在 JS 里读；算好后以 CSS 变量挂到根节点，折叠参数交给 WXS
  initNavMetrics: function () {
    const win = wx.getWindowInfo();
    const capsule = wx.getMenuButtonBoundingClientRect();
    const rpx = win.windowWidth / 750;
    const statusBar = win.statusBarHeight || 20;
    // 和系统导航栏同高：状态栏 + iOS 44 / 安卓 48；胶囊在这一行里偏上，不能按胶囊上下对称算
    const platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform;
    const rowHeight = platform === 'android' ? 48 : 44;
    const navBottom = Math.max(statusBar + rowHeight, capsule.bottom + (capsule.top - statusBar));
    this.jsData.navBottom = navBottom;
    const searchTop = navBottom + 24 * rpx;            // 展开：导航栏下方 24rpx
    const searchArea = searchTop + 80 * rpx + 16 * rpx; // 下方 16rpx + 校区行自带 8rpx，合起来 24rpx

    // 收起轨迹（进度 p 由 collapseNav.wxs 按时间推进）：先收窄变矮，再升进胶囊那一行，全程不碰胶囊。
    // 纵向 qy = 4p³ − 3p⁴，横向 qx = smoothstep(p / ps)，两端速度都为 0。
    // 顶边到胶囊下沿时（纵向进度 pc）横向必须已收完，ps 取满足 qy(ps) = pc 的值，即横向能用的最长区间
    const rise = searchTop - capsule.top; // 纵向行程：搜索框顶边升到胶囊顶边
    const pc = Math.min(Math.max((searchTop - capsule.bottom) / rise, 0.02), 0.98);
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (4 * mid ** 3 - 3 * mid ** 4 < pc) lo = mid; else hi = mid;
    }
    // 阈值：展开的搜索栏离下方校区行只有 24rpx，所以滚过 20rpx（内容碰到它之前）就收起；
    // 回到 12rpx 以内展开（中间留缓冲防抖）。快速甩回顶部可能没有滚动事件落在 off 内，由到顶事件兜底
    const on = 20 * rpx;
    const off = 12 * rpx;
    Object.assign(this.jsData, { navOn: on, navOff: off, searchBottom: searchTop + 80 * rpx });
    this.setData({
      navVars: `--cap-top: ${capsule.top}px; --cap-h: ${capsule.height}px; --nav-bottom: ${navBottom}px; --search-top: ${searchTop}px; --search-area: ${searchArea}px;`,
      navM: {
        on,                                               // scrollTop 超过它收起
        off,                                              // scrollTop 低于它展开
        rise,                                             // 纵向行程
        ps: lo,                                           // 横向（宽、高、左右边距）在进度 ps 时收完
        eh: 80 * rpx,
        ch: capsule.height,
        epl: 32 * rpx,                                     // 展开：左右边距同页面边距
        epr: 32 * rpx,
        cpl: win.windowWidth - capsule.right,              // 收起：左边距与胶囊右侧留白相同，左右对称
        cpr: win.windowWidth - capsule.left + 16 * rpx,    // 收起：筛选按钮离胶囊 16rpx
      },
    });
  },

  fHide: function () {
    this.jsData.filtersSnapshot = null;
    this.setData({ filters_show: false });
  },

  fCancel: function () {
    const snapshot = this.jsData.filtersSnapshot;
    this.jsData.filtersSnapshot = null;
    this.setData({ filters_show: false });
    if (snapshot) this.setFilters(snapshot);
  },

  fClickMain: function (e) {
    this.setData({ filters_sub: e.currentTarget.dataset.index });
  },

  // 写回筛选，并算出面板要用的派生数据：各组已选项数、各校区是否选中
  setFilters: function (filters, extra = {}) {
    const isOn = c => c.all_active || c.items.some(item => item.active);
    const filters_tab_counts = filters.map(mainF => {
      const cats = mainF.category;
      if (cats[0].all_active) return 0;
      if (mainF.cateKey) return cats.filter((c, i) => i > 0 && isOn(c)).length;
      return cats.reduce((n, c, i) => n + c.items.filter(item => item.active).length + (i > 0 && c.all_active ? 1 : 0), 0);
    });
    const campusF = filters.find(mainF => mainF.cateKey);
    const campus_on = campusF ? campusF.category.map((c, i) => i > 0 && isOn(c)) : [];
    this.setData({ ...extra, filters, filters_tab_counts, campus_on });
  },

  // 面板里点选项：data-cat 为分类下标，data-item 为分类内选项下标（缺省表示点分类本身）
  fPick: function (e) {
    const { cat, item } = e.currentTarget.dataset;
    const filters = this.data.filters;
    const mainF = filters[this.data.filters_sub];
    const cats = mainF.category;
    const resetAll = () => cats.forEach((c, i) => {
      c.all_active = i === 0;
      c.items.forEach(it => { it.active = false; });
    });

    if (cat === 0 && item === undefined) {
      // 「全部 X」
      resetAll();
    } else if (item === undefined) {
      // 校区：整校区开关，区域清空
      const c = cats[cat];
      const on = c.all_active || c.items.some(it => it.active);
      c.items.forEach(it => { it.active = false; });
      c.all_active = !on;
      if (!on) cats[0].all_active = false;
    } else {
      const c = cats[cat];
      c.items[item].active = !c.items[item].active;
      if (mainF.cateKey) {
        // 校区下的区域一个都不选时，回到整个校区
        c.all_active = !c.items.some(it => it.active);
      } else {
        c.all_active = false;
        cats[0].all_active = false;
      }
    }

    // 一项都没选时回到「全部」，保证面板始终是合法状态
    const any = cats.some((c, i) => (i > 0 && c.all_active) || c.items.some(it => it.active));
    if (!any) resetAll();
    this.setFilters(filters);
  },

  // 面板里的「重置」只清空选择，点「完成」才应用
  fResetPanel: function () {
    const filters = this.data.filters;
    filters.forEach(mainF => mainF.category.forEach(c => {
      c.all_active = c.name.includes('全部');
      c.items.forEach(it => { it.active = false; });
    }));
    this.setFilters(filters);
  },

  // advance版状态过滤器，临时添加，期待完全重构。（TODO）
  // 获取某个状态子分类被选择的值
  selectStatusValues: function (subCategory) {
    if (!subCategory || !Array.isArray(subCategory.items)) return [];
    if (subCategory.all_active) return subCategory.items.map(it => it.value);
    const values = [];
    for (const it of subCategory.items) {
      if (it.active) values.push(it.value);
    }
    return values;
  },

  // 状态处理条件构建
  buildStatusConditions: function (mainF) {
    const conditions = [];
    if (!mainF || !Array.isArray(mainF.category)) return conditions;
    // 全部状态被激活则无需添加条件
    if (mainF.category[0] && mainF.category[0].all_active) return conditions;

    const adoptCategory = mainF.category.find(c => c.name === '领养状态');
    const sterilCategory = mainF.category.find(c => c.name === '绝育状态');
    const otherCategory  = mainF.category.find(c => c.name === '其他');

    // 领养状态支持数值 in 与 null不存在，null算是脏数据了
    const adoptVals = this.selectStatusValues(adoptCategory);
    if (adoptVals.length) {
      const or = [];
      const numeric = adoptVals.filter(v => v !== null);
      if (numeric.length) or.push({ adopt: { $in: numeric } });
      if (adoptVals.includes(null)) or.push({ adopt: { $exists: false } });
      if (or.length === 1) conditions.push(or[0]);
      else if (or.length > 0) conditions.push({ $or: or });
    }

    // 绝育状态同时选中true/false忽略该条件
    const sterilVals = this.selectStatusValues(sterilCategory);
    if (sterilVals.length) {
      const hasT = sterilVals.includes(true);
      const hasF = sterilVals.includes(false);
      if (!(hasT && hasF)) {
        if (hasF) {
          conditions.push({ $or: [ { sterilized: false }, { sterilized: { $exists: false } } ] });
        } else if (hasT) {
          conditions.push({ sterilized: true });
        }
      }
    }

    // 其他，missing 与 to_star……
    const otherVals = this.selectStatusValues(otherCategory);
    if (otherVals.length) {
      const otherConds = [];
      for (const val of otherVals) {
        if (!val || !val.field) continue;
        if (val.field === 'missing') {
          if (val.condition === true) {
            otherConds.push({ missing: true });
          } else {
            otherConds.push({ $or: [ { missing: false }, { missing: { $exists: false } } ] });
          }
        } else if (val.field === 'to_star' && val.condition === true) {
          otherConds.push({ to_star: true });
        }
      }
      if (otherConds.length) conditions.push({ $or: otherConds });
    }

    return conditions;
  },
  
  fGet: async function() {
    const filters = this.data.filters;
    const conditions = [];
    
    // 处理选择的过滤器
    filters.forEach(mainF => {
      const key = mainF.key;
      // 状态过滤
      if (key === 'status') {
        const statusConds = this.buildStatusConditions(mainF);
        if (statusConds.length) conditions.push(...statusConds);
        return;
      }
      
      // 处理其他过滤器 (area, colour)
      if (mainF.category[0].all_active) return;

      // 校区：整校区选中按 campus 过滤（没有二级地址的校区也能筛），只选了部分区域时按「校区+区域」过滤
      if (mainF.cateKey) {
        const campusConds = [];
        mainF.category.slice(1).forEach(category => {
          if (category.all_active) {
            campusConds.push({ [mainF.cateKey]: category.name });
            return;
          }
          const areas = category.items.filter(item => item.active).map(item => item.name);
          if (areas.length) campusConds.push({ [mainF.cateKey]: category.name, [key]: { $in: areas } });
        });
        if (campusConds.length) conditions.push(campusConds.length > 1 ? { $or: campusConds } : campusConds[0]);
        return;
      }

      const selected = [];
      mainF.category.forEach(category => {
        category.items.forEach(item => {
          if (category.all_active || item.active) {
            let choice = item.name;
            if (item.value !== undefined) {
              choice = item.value;
            }
            if (item.value === null) {
              choice = { $exists: false };
            }
            
            selected.push(choice);
          }
        });
      });
      
      if (selected.length > 0) {
        let hasNull = selected.some(val => typeof val === 'object' && val !== null && val.$exists === false);
        let nonNullSelected = selected.filter(val => !(typeof val === 'object' && val !== null && val.$exists === false));
        
        let fieldCondition = [];
        if (nonNullSelected.length > 0) {
          fieldCondition.push({ [key]: { $in: nonNullSelected } });
        }
        if (hasNull) {
          fieldCondition.push({ [key]: { $exists: false } });
        }
        
        if (fieldCondition.length > 1) {
          conditions.push({ $or: fieldCondition });
        } else if (fieldCondition.length === 1) {
          conditions.push(fieldCondition[0]);
        }
      }
    });
    
    // 处理搜索词：只用已生效的，输入框里未确认的文字不参与查询（否则翻页会混进新关键词的结果）
    const search = regReplace(this.data.filters_search);
    if (search) {
      const searchTerms = search.trim().split(' ');
      const regexPattern = searchTerms.map(term => `.*${term}.*`).join('|');
      
      conditions.push({
        $or: [
          { name: { $regex: regexPattern } },
          { nickname: { $regex: regexPattern } }
        ]
      });
    }
    
    // 检查是否有用户定义的过滤条件
    const hasUserFilters = conditions.length > 0;
    // 筛选按钮角标：生效的筛选维度数（校区、花色、状态各算一个）。
    // 校区也计入：上滑后校区行会滚出屏幕，且筛选卡片的「校区」标签同样显示数量
    const filters_count = filters.filter(mainF => (
      mainF.key === 'status' ? this.buildStatusConditions(mainF).length > 0 : !mainF.category?.[0]?.all_active
    )).length;
    this.setData({ 
      filters_active: hasUserFilters,
      filters_empty: !hasUserFilters,
      filters_count,
    });
    
    // 添加软删除过滤条件
    conditions.push({ deleted: { $ne: 1 } });
    // EMAS 兼容：find 对 $and 包装的查询会返回空结果（count 正常），
    // 单键条件直接拍平合并，尽量不产生 $and
    const merged = {};
    const rest = [];
    for (const cond of conditions) {
      const keys = Object.keys(cond);
      if (keys.length === 1 && !keys[0].startsWith('$') && !(keys[0] in merged)) {
        merged[keys[0]] = cond[keys[0]];
      } else {
        rest.push(cond);
      }
    }
    if (rest.length === 0) return merged;
    if (Object.keys(merged).length === 0 && rest.length === 1) return rest[0];
    return { $and: rest.concat([merged]) };
  },
  
  // 筛选面板的各种点选都保证至少有一项（「全部」也算），这里直接应用
  fConfirm: function() {
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
    
    this.setData({ filters });
    await this.fConfirm();
  },
  
  fClickCampus: async function(e) {
    if (this.jsData.pageLoadingLock) return false;
    // 外显校区是单选：只亮点中的那个，再点已选中的不取消
    const index = e.currentTarget.dataset.index;
    const filters = this.data.filters;
    if (filters[0].category[index]?.all_active) return false;
    filters[0].category.forEach((c, i) => {
      c.all_active = i === index;
      c.items.forEach(item => { item.active = false; });
    });
    this.setData({ filters });
    await this.fConfirm();
  },
  
  // 搜索：输入框里的文字只有按键盘搜索键才生效。聚焦就在原地输入，没有单独的搜索模式
  fSearchFocus: function() {
    clearTimeout(this.jsData.searchBlurTimer); // 点叉号会短暂失焦再聚焦，不算结束输入
    this.jsData.searchEditing = true;
    if (this.data.filters_show) this.fCancel(); // 筛选卡片开着时去搜索，放弃筛选修改
  },

  // 收起键盘但没按搜索：输入框恢复成已生效的搜索词，避免「框里是一个词、列表是另一个结果」。
  // 稍等一下再判断：按搜索键时失焦可能先于 confirm 到达，点叉号也会短暂失焦
  fSearchBlur: function() {
    clearTimeout(this.jsData.searchBlurTimer);
    this.jsData.searchBlurTimer = setTimeout(() => {
      if (!this.jsData.searchEditing) return;
      this.jsData.searchEditing = false;
      this.setData({ filters_input: this.data.filters_search });
    }, 150);
  },

  fSearchInput: function(e) {
    this.setData({ filters_input: e.detail.value });
  },
  
  fSearch: function() {
    clearTimeout(this.jsData.searchBlurTimer);
    this.jsData.searchEditing = false;
    const value = (this.data.filters_input || '').trim();
    const changed = value !== this.data.filters_search;
    this.setData({ filters_input: value, filters_search: value });
    if (changed) this.reloadCats();
  },
  
  // 叉号：输入框已由 input 事件清空。正在输入时只是改输入，不加载；
  // 没在输入时叉号只会出现在已生效的搜索词上，这时清掉才重新加载
  fSearchClear: function() {
    if (this.jsData.searchEditing || !this.data.filters_search) return;
    this.setData({ filters_search: '' });
    this.reloadCats();
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
  
  async countWaitingAdopt() {
    const target = config.cat_status_adopt_target;
    const value = config.cat_status_adopt.indexOf(target);
    const { result: adopt_count } = await app.mpServerless.db.collection('cat').count({ adopt: value, deleted: { $ne: 1 } });
    this.setData({ adopt_count });
  },

  async clickAdoptBtn() {
    if (this.jsData.pageLoadingLock) return false;
    this.lockBtn();
    
    const filters = [...this.data.filters];
    // 查找 status 过滤器的索引
    const status_filter_index = filters.findIndex(f => f.key === "status");
    if (status_filter_index === -1) {
      this.unlockBtn();
      return false;
    }
    
    // 查找领养状态子类别的索引
    const adopt_category_index = filters[status_filter_index].category.findIndex(
      category => category.name === "领养状态"
    );
    if (adopt_category_index === -1) {
      this.unlockBtn();
      return false;
    }
    
    const target_status = config.cat_status_adopt_target;
    const adoptCategory = filters[status_filter_index].category[adopt_category_index];
    
    // 查找目标状态在子类别中的索引
    const target_index = adoptCategory.items.findIndex(item => item.name === target_status);
    
    if (target_index === -1) {
      console.log("[点击领养按钮] 找不到目标领养状态");
      this.unlockBtn();
      return false;
    }
    
    if (adoptCategory.items[target_index].active) {
      // 已经激活了
      this.unlockBtn();
      return false;
    }
    
    // 重置所有状态选项
    for (let i = 0; i < filters[status_filter_index].category.length; i++) {
      const category = filters[status_filter_index].category[i];
      category.all_active = false; // 全部设为false，包括全部状态
      
      if (category.items) {
        for (let j = 0; j < category.items.length; j++) {
          category.items[j].active = false;
        }
      }
    }
    
    // 激活目标领养状态
    adoptCategory.items[target_index].active = true;
    
    this.setData({ filters });
    
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
    // 先清搜索词再重置筛选，只由 fReset 加载一次
    this.setData({ filters_input: '', filters_search: '' });
    await this.fReset();
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

    // 关联猫猫（选填）
    await this.loadNewsCat(newsList[0]);

    if (!this.checkNewsVisited()) {
      this.newsModal.showNewsModal();
    }
  },

  // 弹窗里的关联猫猫：名称 + 随机精选头像
  async loadNewsCat(news) {
    if (!news || !news.cat_id) {
      return;
    }
    try {
      const [cat, avatar] = await Promise.all([getCatItem(news.cat_id), getAvatar(news.cat_id)]);
      if (!cat) return;
      this.setData({
        'newsList[0].catName': cat.name || '',
        'newsList[0].catAvatar': avatar ? (avatar.photo_compressed || avatar.photo_id) : '',
        'newsList[0].catInitial': cat.name ? String(cat.name).slice(0, 1) : '',
      });
    } catch (err) {
      console.warn('[loadNewsCat] - 读取关联猫猫失败:', err);
    }
  },

  // 点击弹窗内猫猫头像：关闭弹窗并进入猫咪主页
  _catTapEvent() {
    const news = this.data.newsList[0];
    this.newsModal.hideNewsModal();
    this.setNewsVisited();
    if (!news || !news.cat_id) return;
    wx.navigateTo({
      url: `/pages/genealogy/detailCat/detailCat?cat_id=${news.cat_id}`,
    });
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