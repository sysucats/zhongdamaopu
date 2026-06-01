import { showTab } from "../../../utils/page";
import config from "../../../config";
import { isDemoMode, getDemoMapData } from "../../../utils/demo";
import { checkCanUseMap } from "../../../utils/user";

const app = getApp();

const CAMPUS_CENTER = config.map_center;

Page({
  data: {
    latitude: CAMPUS_CENTER.latitude,
    longitude: CAMPUS_CENTER.longitude,
    scale: 16,
    markers: [],
    showDetail: false,
    currentPhoto: null,
    currentCat: null,
    tabBarHeight: 0,
    text_cfg: config.text,
    loading: true,
    demoMode: false,
  },

  jsData: {
    allPhotos: [],
    markers: [],
    catMap: {},
    markerIconMap: {},
  },

  async onLoad() {
    const canUse = await checkCanUseMap();
    if (!canUse) {
      wx.showModal({
        title: '权限提示',
        content: '请向管理员申请校园导览权限',
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
    this.loadMarkerIcons();
    this.loadMapData();
  },

  onShow() {
    showTab(this);
    this.loadMapData();
  },

  onShareAppMessage() {
    return {
      title: `来看看校园里的猫猫都在哪里~ - ${config.text.app_name}`,
      path: '/pages/map/index/index'
    };
  },

  async loadMapData() {
    if (isDemoMode()) {
      this.loadDemoData();
      return;
    }

    try {
      const photoRes = await app.mpServerless.db.collection('photo')
        .where({
          latitude: app.mpServerless.db.command.neq(null),
          longitude: app.mpServerless.db.command.neq(null),
          verified: true
        })
        .field({ cat_id: 1, latitude: 1, longitude: 1, photo_id: 1, marker_type: 1, create_date: 1, photographer: 1, shooting_date: 1 })
        .orderBy('create_date', 'desc')
        .limit(config.map_max_markers)
        .get();

      const photos = photoRes.result || [];
      if (photos.length === 0) {
        this.setData({ loading: false, markers: [] });
        return;
      }

      const catIds = [...new Set(photos.map(p => p.cat_id).filter(Boolean))];

      let catMap = {};
      if (catIds.length > 0) {
        const catRes = await app.mpServerless.db.collection('cat')
          .where({ _id: app.mpServerless.db.command.in(catIds) })
          .field({ name: 1, _id: 1, campus: 1, area: 1 })
          .get();
        (catRes.result || []).forEach(c => { catMap[c._id] = c; });
      }

      const latestByCat = {};
      photos.forEach(p => {
        if (!p.cat_id) return;
        if (!latestByCat[p.cat_id] ||
            new Date(p.create_date) > new Date(latestByCat[p.cat_id].create_date)) {
          latestByCat[p.cat_id] = p;
        }
      });

      const allPhotos = Object.values(latestByCat)
        .sort((a, b) => new Date(b.create_date) - new Date(a.create_date));

      this.jsData.allPhotos = allPhotos;
      this.jsData.catMap = catMap;
      this.generateMarkers(allPhotos);
      this.setData({ loading: false });
    } catch (err) {
      console.error('加载地图数据失败:', err);
      this.setData({ loading: false });
    }
  },

  async loadMarkerIcons() {
    try {
      const { result: icons } = await app.mpServerless.db.collection('marker_icon')
        .find({ enabled: true });
      const map = {};
      (icons || []).forEach(i => { map[i.name] = i.img; });
      this.jsData.markerIconMap = map;
    } catch (e) {
      console.warn('加载标记图标失败:', e.message);
    }
  },

  loadDemoData() {
    const { allPhotos, catMap } = getDemoMapData();
    this.jsData.allPhotos = allPhotos;
    this.jsData.catMap = catMap;
    this.generateMarkers(allPhotos);
    this.setData({ loading: false });
  },

  generateMarkers(photos) {
    const catMap = this.jsData.catMap || {};
    const markers = photos.map((p, index) => {
      const cat = catMap[p.cat_id] || {};
      const icon = p.marker_type ? (this.jsData.markerIconMap[p.marker_type] || null) : null;
      return {
        id: index,
        latitude: p.latitude,
        longitude: p.longitude,
        title: cat.name || '未知猫咪',
        width: 36,
        height: 36,
        iconPath: icon || undefined,
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
    const photo = this.jsData.allPhotos[markerId];
    if (!photo) return;

    const cat = (this.jsData.catMap || {})[photo.cat_id] || {};

    this.setData({
      showDetail: true,
      currentPhoto: photo,
      currentCat: cat
    });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  onRegionChange(e) {
    if (e.type === 'end' && e.causedBy === 'scale') {
      const currentScale = e.detail.scale;
      if (currentScale < 14) {
        const latest = this.jsData.allPhotos.slice(0, 10);
        this.generateMarkers(latest);
      } else {
        this.generateMarkers(this.jsData.allPhotos);
      }
    }
  },

  goToDetail() {
    const catId = this.data.currentPhoto?.cat_id;
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
