import { showTab } from "../../../utils/page";
import config from "../../../config";
import { isDemoMode, getDemoMapData } from "../../../utils/demo";
import { checkCanUseMap } from "../../../utils/user";
import { getAvatar } from "../../../utils/cat";

const app = getApp();

const CAMPUS_CENTER = config.map_center;

Page({
  data: {
    latitude: CAMPUS_CENTER.latitude,
    longitude: CAMPUS_CENTER.longitude,
    scale: 16,
    markers: [],
    showDetail: false,
    currentCat: null,
    tabBarHeight: 0,
    text_cfg: config.text,
    loading: true,
    demoMode: false,
  },

  jsData: {
    catList: [],       // 猫列表（直接从 cat 集合获取）
    catMap: {},        // cat_id -> cat 信息
    avatarMap: {},     // cat_id -> avatar photo 对象
    userLocated: false, // 是否已获取用户定位
    loaded: false,      // 首次加载完成标记
  },

  async onLoad() {
    const canUse = await checkCanUseMap();
    if (!canUse) {
      wx.showModal({
        title: '权限提示',
        content: '请向管理员申请喵地图权限',
        confirmText: '去申请',
        cancelText: '返回',
        success(res) {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/genealogy/applyMapAccess/applyMapAccess' });
          } else {
            wx.navigateBack({ delta: 1 });
          }
        }
      });
      return;
    }
    this.setData({ demoMode: isDemoMode() });
    this.locateUser();
  },

  onShow() {
    showTab(this);
    // 首次加载由 locateUser 触发，之后每次 onShow 刷新数据
    if (this.jsData.loaded) {
      this.loadMapData();
    }
  },

  onShareAppMessage() {
    return {
      title: `来看看校园里的猫猫都在哪里~ - ${config.text.app_name}`,
      path: '/pages/map/index/index'
    };
  },

  // 获取用户定位，成功则设置地图中心
  async locateUser() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.getLocation({
          type: 'gcj02',
          success: resolve,
          fail: reject
        });
      });
      this.setData({
        latitude: res.latitude,
        longitude: res.longitude
      });
      this.jsData.userLocated = true;
    } catch (e) {
      console.log('获取用户定位失败，使用默认中心点:', e.message);
      this.setData({
        latitude: CAMPUS_CENTER.latitude,
        longitude: CAMPUS_CENTER.longitude
      });
    }
    this.loadMapData();
  },

  // 直接查 cat 集合（cat 的 mapMarker 字段含坐标）
  async loadMapData() {
    if (isDemoMode()) {
      this.loadDemoData();
      return;
    }

    try {
      const catRes = await app.mpServerless.db.collection('cat')
        .find({
          mapMarker: { $ne: null },
        }, {
          projection: { name: 1, _id: 1, campus: 1, area: 1, gender: 1, characteristics: 1, habit: 1, tutorial: 1, mapMarker: 1 },
          limit: config.map_max_markers
        });

      const catList = catRes.result || [];
      if (catList.length === 0) {
        this.setData({ loading: false, markers: [] });
        return;
      }

      this.jsData.catList = catList;
      this.jsData.catMap = {};
      catList.forEach(c => { this.jsData.catMap[c._id] = c; });
      await this.generateMarkers(catList);
      this.jsData.loaded = true;
      this.setData({ loading: false });
    } catch (err) {
      console.error('加载地图数据失败:', err);
      this.setData({ loading: false });
    }
  },

  loadDemoData() {
    const { allPhotos, catMap } = getDemoMapData();

    // 同一只猫只保留最新一条
    const latestByCat = {};
    allPhotos.forEach(p => {
      if (!p.cat_id) return;
      if (!latestByCat[p.cat_id] ||
          new Date(p.create_date) > new Date(latestByCat[p.cat_id].create_date)) {
        latestByCat[p.cat_id] = p;
      }
    });

    const catList = Object.keys(latestByCat)
      .map(id => ({ ...latestByCat[id], ...catMap[id] }))
      .filter(c => c.name)
      .sort((a, b) => new Date(b.create_date) - new Date(a.create_date));

    this.jsData.catList = catList;
    this.jsData.catMap = catMap;
    this.jsData.loaded = true;
    this.generateMarkers(catList);
    this.setData({ loading: false });
  },

  async generateMarkers(catList) {
    // 批量获取所有猫的头像
    const catIds = [...new Set(catList.map(c => c._id).filter(Boolean))];
    const avatars = catIds.length > 0 ? await getAvatar(catIds) : [];
    const avatarMap = {};
    catIds.forEach((id, i) => { avatarMap[id] = avatars[i]; });
    this.jsData.avatarMap = avatarMap;

    const markers = catList.map((cat, index) => {
      const avatar = avatarMap[cat._id];
      const iconPath = avatar
        ? (avatar.photo_compressed || avatar.photo_id || undefined)
        : undefined;
      const marker = cat.mapMarker || {};
      return {
        id: index,
        catId: cat._id,
        latitude: marker.latitude,
        longitude: marker.longitude,
        title: cat.name || '未知猫咪',
        width: 40,
        height: 40,
        iconPath,
        callout: {
          content: cat.name || '猫咪',
          color: '#92400E',
          fontSize: 13,
          borderRadius: 10,
          bgColor: '#ffd101',
          padding: 7,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      };
    });

    this.jsData.markers = markers;
    this.setData({ markers });
  },

  onMarkerTap(e) {
    const markerId = e.detail.markerId;
    const catInfo = this.jsData.catList[markerId];
    if (!catInfo) return;

    const avatar = this.jsData.avatarMap[catInfo._id];

    // 组装详情数据：猫基本信息 + 头像
    this.setData({
      showDetail: true,
      currentCat: {
        ...catInfo,
        avatarUrl: avatar ? (avatar.photo_compressed || avatar.photo_id) : undefined
      }
    });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  onRegionChange(e) {
    if (e.type === 'end' && e.causedBy === 'scale') {
      const currentScale = e.detail.scale;
      if (currentScale < 14) {
        const latest = this.jsData.catList.slice(0, 10);
        this.generateMarkers(latest);
      } else {
        this.generateMarkers(this.jsData.catList);
      }
    }
  },

  goToDetail() {
    const catId = this.data.currentCat?._id;
    if (!catId) return;

    this.setData({ showDetail: false });

    wx.navigateTo({
      url: `/pages/genealogy/detailCat/detailCat?cat_id=${catId}`
    });
  },

  preventTouchMove() {
    return false;
  }
});
