import { showTab, loadFilter } from "../../../utils/page";
import config from "../../../config";
import { isDemoMode, getDemoMapData } from "../../../utils/demo";
import { checkCanUseMap } from "../../../utils/user";
import { getAvatar } from "../../../utils/cat";
import { signCosUrl } from "../../../utils/common";

const app = getApp();

const CAMPUS_CENTER = config.map_center;

Page({
  data: {
    latitude: CAMPUS_CENTER.latitude,
    longitude: CAMPUS_CENTER.longitude,
    scale: 12,
    markers: [],
    showDetail: false,
    currentCat: null,
    tabBarHeight: 0,
    text_cfg: config.text,
    loading: true,
    demoMode: false,
    campusButtons: [],    // [{name, latitude, longitude, scale}] 有坐标的校区
    campusBtnExpanded: false,  // 校区按钮是否展开
    showTrajectory: false,       // 是否正在展示轨迹
    trajectoryPoints: [],        // 当前展示的轨迹点（来自 inter 表）
    trajectoryMarkers: [],      // 轨迹点 marker（替代普通猫 marker）
    trajectoryPolyline: [],     // 折线
    totalCats: 0,              // 喵地图上总的猫猫数量（左下角显示）
    clusterThreshold: 15,      // 缩放小于该值时合并重合猫咪为数量圈
    photoPanDistance: 0,       // 详情卡照片需上下移动的距离（px），0 表示无需移动
    photoPanDuration: 6,       // 单程动画时长（秒）
  },

  jsData: {
    catList: [],       // 猫列表（直接从 cat 集合获取）
    catMap: {},        // cat_id -> cat 信息
    avatarMap: {},     // cat_id -> avatar photo 对象
    userLocated: false, // 是否已获取用户定位
    loaded: false,      // 首次加载完成标记
    campusCenters: {},  // { campusName: { latitude, longitude, scale } }
    markerIconMap: {},  // cat_id -> 已绘制好的圆形头像临时文件路径（避免重绘闪动）
    avatarDrawn: false, // 圆形头像是否已首次绘制完成（仅首次进入页面绘制）
    clusterIconCache: {}, // { count: tempFilePath } 数量圈图标缓存（按猫数量复用）
    currentScale: null,   // 当前地图缩放级别（onRegionChange 更新）
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
    this.loadCampusCenters();
    this.locateUser();
  },

  // 加载校区中心坐标（从 setting.filter 的 campusCenters 字段）
  async loadCampusCenters() {
    try {
      var filter = await loadFilter({ nocache: true });
      var centers = filter && filter.campusCenters;
      this.jsData.campusCenters = centers || {};
      // 生成 WXML 用的按钮列表：仅包含有坐标的校区
      var buttons = [];
      for (var name in this.jsData.campusCenters) {
        var c = this.jsData.campusCenters[name];
        if (c && c.latitude != null && c.longitude != null) {
          buttons.push({
            name: name,
            latitude: c.latitude,
            longitude: c.longitude,
            scale: c.scale || 14,
          });
        }
      }
      this.setData({ campusButtons: buttons });
    } catch (e) {
      console.log('加载校区中心坐标失败:', e.message);
    }
  },

  onShow() {
    showTab(this);
    // 首次加载由 locateUser 触发，之后每次 onShow 刷新数据
    // 轨迹模式下不刷新数据（预览照片等操作会触发 onShow）
    if (this.jsData.loaded && !this.data.showTrajectory) {
      this.loadMapData();
      this.loadCampusCenters();
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
      // 先请求隐私协议授权
      await this._requestLocationPrivacy();

      const res = await new Promise((resolve, reject) => {
        wx.getFuzzyLocation({
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

  _requestLocationPrivacy() {
    return new Promise((resolve) => {
      if (typeof wx.requirePrivacyAuthorize !== 'function') {
        resolve();
        return;
      }
      wx.requirePrivacyAuthorize({
        success: resolve,
        fail: () => {
          console.log('用户未同意隐私协议');
          resolve(); // 即使用户拒绝也继续，让 getFuzzyLocation 自己报错
        }
      });
    });
  },

  // 调用云函数 getCatLocations，从 photo 表 aggregate 获取每只猫最新位置
  async loadMapData() {
    if (isDemoMode()) {
      this.loadDemoData();
      return;
    }

    try {
      const { result: res } = await app.mpServerless.function.invoke('unionOp', {
        unionAction: 'getCatLocations'
      });

      const catList = (res && res.success && res.data) || [];
      if (catList.length === 0) {
        this.jsData.catList = [];
        this.jsData.catMap = {};
        this.setData({ loading: false, markers: [], totalCats: 0 });
        return;
      }

      // catList 中每条记录格式：
      // { cat_id, name, latitude, longitude, location_time, trajectory_count, avatar, campus, area, gender, ... }

      // 数据等价性检查：若 catList 关键字段（cat_id + 坐标 + trajectory_count）与之前一致，
      // 跳过 generateMarkers，避免 map 组件重新渲染 markers 造成头像闪动
      const oldList = this.jsData.catList || [];
      const isSame = oldList.length === catList.length && oldList.every((old, i) => {
        const cur = catList[i];
        return old.cat_id === cur.cat_id
          && old.latitude === cur.latitude
          && old.longitude === cur.longitude
          && (old.trajectory_count || 0) === (cur.trajectory_count || 0);
      });

      this.jsData.catList = catList;
      this.jsData.catMap = {};
      catList.forEach(c => { this.jsData.catMap[c.cat_id] = c; });
      this.setData({ totalCats: catList.length });

      if (isSame && this.jsData.avatarDrawn) {
        // 数据未变化且圆形头像已绘制：仅关闭 loading
        // 但仍需恢复猫 markers（可能被轨迹模式覆盖），并按当前 scale 应用聚合
        this.jsData.loaded = true;
        this.setData({ loading: false });
        const scale = this.jsData.currentScale != null ? this.jsData.currentScale : this.data.scale;
        this._applyCluster(scale);
        return;
      }

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
    this.setData({ loading: false, totalCats: catList.length });
    this.generateMarkers(catList);
  },

  /**
   * 用 Canvas 将头像图片裁剪为圆形 + 白色边框，返回临时文件路径
   * 串行执行（Canvas 是单资源），带超时保护
   */
  drawCircleAvatar(canvas, imgUrl) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('drawCircleAvatar 超时');
        resolve(null);
      }, 5000);

      try {
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        const size = 80;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        const img = canvas.createImage();
        img.onload = () => {
          try {
            const borderWidth = 4;
            const innerSize = size - borderWidth * 2;
            const cx = size / 2;
            const cy = size / 2;
            const radius = innerSize / 2;

            // 白色圆形背景（边框）
            ctx.beginPath();
            ctx.arc(cx, cy, radius + borderWidth / 2, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();

            // 裁剪为圆形画头像
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.clip();

            // aspectFill：按短边缩放，居中裁剪
            const imgW = img.width;
            const imgH = img.height;
            const scale = Math.max(innerSize / imgW, innerSize / imgH);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
            ctx.restore();

            // 导出临时文件
            wx.canvasToTempFilePath({
              canvas,
              destWidth: size * dpr,
              destHeight: size * dpr,
              success: (res) => {
                clearTimeout(timeout);
                resolve(res.tempFilePath);
              },
              fail: (err) => {
                console.warn('canvasToTempFilePath 失败:', err);
                clearTimeout(timeout);
                resolve(null);
              }
            });
          } catch (e) {
            console.warn('绘制头像失败:', e.message);
            clearTimeout(timeout);
            resolve(null);
          }
        };
        img.onerror = () => {
          console.warn('加载头像图片失败:', imgUrl);
          clearTimeout(timeout);
          resolve(null);
        };
        img.src = imgUrl;
      } catch (e) {
        console.warn('drawCircleAvatar 异常:', e.message);
        clearTimeout(timeout);
        resolve(null);
      }
    });
  },

  async generateMarkers(catList) {
    // 批量获取所有猫的头像（新格式下 catList 含 avatar 字段，但仍需确保可访问）
    const catIds = [...new Set(catList.map(c => c.cat_id || c._id).filter(Boolean))];
    const avatars = catIds.length > 0 ? await getAvatar(catIds) : [];
    const avatarMap = {};
    catIds.forEach((id, i) => { avatarMap[id] = avatars[i]; });
    // 若云函数已返回 avatar，直接覆盖（以云函数数据为准）
    catList.forEach(c => {
      const id = c.cat_id || c._id;
      if (c.avatar) avatarMap[id] = c.avatar;
    });
    this.jsData.avatarMap = avatarMap;

    // 生成 markers：
    //   - 优先使用已缓存的圆形头像路径（markerIconMap），避免重绘闪动
    //   - 没有缓存时回退到原图（后续 _renderCircleIcons 会异步生成圆形头像并替换）
    const markers = catList.map((cat, index) => {
      const catId = cat.cat_id || cat._id;
      const avatar = avatarMap[catId];
      const cachedCircle = this.jsData.markerIconMap[catId];
      const iconPath = cachedCircle
        ? cachedCircle
        : (avatar ? (avatar.photo_compressed || avatar.photo_id || undefined) : undefined);
      const lat = cat.latitude != null ? cat.latitude : undefined;
      const lng = cat.longitude != null ? cat.longitude : undefined;
      return {
        id: index,
        catId: catId,
        latitude: lat,
        longitude: lng,
        title: cat.name || '未知猫咪',
        width: 40,
        height: 40,
        iconPath,
        callout: {
          content: cat.name || '猫咪',
          color: '#92400E',
          fontSize: 11,
          borderRadius: 6,
          bgColor: '#ffd101',
          padding: 4,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      };
    });

    this.jsData.markers = markers;
    this.setData({ markers });

    // 圆形头像仅在首次进入页面时绘制；之后 onShow 刷新数据复用缓存，不再重绘
    if (!this.jsData.avatarDrawn) {
      this._renderCircleIcons(catList, avatarMap, markers);
    } else {
      // 已有圆形头像缓存：首屏按当前 scale 应用聚合
      const scale = this.jsData.currentScale != null ? this.jsData.currentScale : this.data.scale;
      this._applyCluster(scale);
    }
  },

  async _renderCircleIcons(catList, avatarMap, markers) {
    // 获取 Canvas 节点
    const query = wx.createSelectorQuery();
    let canvas = null;
    try {
      const canvasRes = await new Promise(resolve => {
        query.select('#avatarCanvas').fields({ node: true, size: true }).exec(resolve);
      });
      canvas = canvasRes && canvasRes[0] && canvasRes[0].node;
    } catch (e) {
      console.warn('获取 Canvas 失败，跳过圆形头像');
      return;
    }
    if (!canvas) return;

    // 串行绘制（Canvas 单资源），仅处理「有头像 + 尚未缓存」的猫
    const catIdsWithAvatar = catList
      .map(c => c.cat_id || c._id)
      .filter(id => avatarMap[id] && (avatarMap[id].photo_compressed || avatarMap[id].photo_id)
                    && !this.jsData.markerIconMap[id]);

    let changed = false;
    for (const id of catIdsWithAvatar) {
      const avatar = avatarMap[id];
      const url = avatar.photo_compressed || avatar.photo_id;
      const circlePath = await this.drawCircleAvatar(canvas, url);
      if (circlePath) {
        // 写入缓存，后续 onShow 不再重绘这只猫
        this.jsData.markerIconMap[id] = circlePath;
        const marker = markers.find(m => m.catId === id);
        if (marker) {
          marker.iconPath = circlePath;
          changed = true;
        }
      }
    }

    // 只要有改动就更新；并标记首次绘制完成
    if (changed) {
      this.setData({ markers: [...markers] });
    }
    this.jsData.avatarDrawn = true;

    // 首次绘制完成后，按当前 scale 应用聚合（处理首屏即低缩放的情况）
    const scale = this.jsData.currentScale != null ? this.jsData.currentScale : this.data.scale;
    this._applyCluster(scale);
  },

  async onMarkerTap(e) {
    const markerId = e.detail.markerId;

    // 轨迹模式：点击轨迹点 marker，展示该点的照片
    if (this.data.showTrajectory) {
      const point = this.data.trajectoryPoints[markerId];
      if (!point) return;

      const rawPhoto = point.photo_compressed || point.photo_id;
      const signedUrl = await signCosUrl(rawPhoto || '');

      this.setData({
        showDetail: true,
        photoPanDistance: 0,
        currentCat: {
          _id: this.jsData.trajectoryCatId,
          name: this.jsData.trajectoryCatName,
          avatarUrl: signedUrl || this.jsData.trajectoryCatAvatar,
          campus: this.jsData.trajectoryCatCampus || '',
          area: this.jsData.trajectoryCatArea || '',
          adopt: this.jsData.trajectoryCatAdopt || '0',
          to_star: this.jsData.trajectoryCatToStar || false,
          isTrajectoryPoint: true,
          trajectoryPointDate: point.location_time || '',
          trajectoryPointLat: point.latitude,
          trajectoryPointLng: point.longitude,
          trajectoryPointUser: point.photographer || '',
        }
      });
      return;
    }

    // 聚合 marker（id 从 100000 起）：放大地图到该聚合点，展示内部猫咪
    if (markerId >= 100000) {
      const marker = (this.data.markers || []).find(m => m.id === markerId);
      if (marker) {
        const newScale = Math.min(20, (this.jsData.currentScale || this.data.scale || 12) + 3);
        // 主动更新 currentScale 并还原所有猫 markers
        // （放大后必然 >= clusterThreshold，直接显示完整列表，无需等 regionchange）
        this.jsData.currentScale = newScale;
        this.setData({
          latitude: marker.latitude,
          longitude: marker.longitude,
          scale: newScale,
        });
        this._applyCluster(newScale);
      }
      return;
    }

    // 普通模式：点击猫 marker，展示猫信息卡
    const catInfo = this.jsData.catList[markerId];
    if (!catInfo) return;

    const catId = catInfo.cat_id || catInfo._id;
    const avatar = catInfo.avatar || this.jsData.avatarMap[catId];

    // 组装详情数据：猫基本信息 + 头像
    // 确保 _id 字段存在（供 goToDetail 使用）
    this.setData({
      showDetail: true,
      photoPanDistance: 0,
      currentCat: {
        ...catInfo,
        _id: catId,
        avatarUrl: avatar ? (avatar.photo_compressed || avatar.photo_id) : undefined,
        trajectory_count: catInfo.trajectory_count || 0,
      }
    });
  },

  previewPhoto() {
    const { currentCat } = this.data;
    if (!currentCat?.avatarUrl) return;
    wx.previewImage({
      current: currentCat.avatarUrl,
      urls: [currentCat.avatarUrl],
    });
  },

  // 详情卡照片加载完成：计算竖屏照片需要上下移动的距离
  // 图片按宽度等比缩放（widthFix），若缩放后高度 > 容器高度，则启用上下往返动画
  // 动画用 CSS @keyframes + infinite alternate 驱动（不依赖 JS transitionend，避免到顶/底闪烁）
  onPhotoLoad(e) {
    const detail = e && e.detail;
    if (!detail || !detail.width || !detail.height) {
      this.setData({ photoPanDistance: 0 });
      return;
    }
    try {
      const sysInfo = wx.getWindowInfo();
      const rpxToPx = sysInfo.windowWidth / 750;
      // 详情卡左右 padding 30rpx，所以容器宽度 = 屏幕宽 - 60rpx
      const containerWidthPx = sysInfo.windowWidth - 60 * rpxToPx;
      const containerHeightPx = 360 * rpxToPx;
      // widthFix 模式：图片宽度 = 容器宽度，高度按比例
      const scaledHeight = detail.height * (containerWidthPx / detail.width);
      const distance = Math.max(0, scaledHeight - containerHeightPx);
      // 单程动画时长：按距离动态调整，约 30px/s，最少 3 秒，最多 12 秒
      const duration = Math.min(12, Math.max(3, Math.round(distance / 30)));
      this.setData({
        photoPanDistance: Math.round(distance),
        photoPanDuration: duration,
      });
    } catch (err) {
      console.warn('计算照片移动距离失败:', err.message);
      this.setData({ photoPanDistance: 0 });
    }
  },

  closeDetail() {
    // 关闭详情卡时重置照片动画状态
    this.setData({ showDetail: false, photoPanDistance: 0 });
  },

  onRegionChange(e) {
    // 微信小程序 map 的 regionchange 在双指缩放时存在两个坑：
    //   1. 双指缩放有时只触发 begin 不触发 end（或 end 延迟）
    //   2. e.detail.scale 可能是缩放前的旧值，导致 oldScale===currentScale 误判
    // 解决方案：begin 和 end 都监听，用防抖等手势稳定后，
    //          通过 mapContext.getScale() 主动获取真实 scale 再决定是否聚合
    if (this._scaleCheckTimer) {
      clearTimeout(this._scaleCheckTimer);
    }
    this._scaleCheckTimer = setTimeout(() => {
      this._scaleCheckTimer = null;
      if (!this.mapCtx) {
        this.mapCtx = wx.createMapContext('campusMap', this);
      }
      this.mapCtx.getScale({
        success: (res) => {
          if (!res || res.scale == null) return;
          const currentScale = res.scale;
          const oldScale = this.jsData.currentScale;
          this.jsData.currentScale = currentScale;
          // 仅当真实 scale 发生变化时才重新聚合（过滤纯平移）
          if (oldScale !== currentScale) {
            this._applyCluster(currentScale);
          }
        }
      });
    }, 250);
  },

  /**
   * 根据 scale 计算聚合后的 markers 并 setData
   * - scale >= clusterThreshold：显示全部原 markers（带圆形头像）
   * - scale <  clusterThreshold：把距离接近的猫合并为数量圈 marker
   */
  async _applyCluster(scale) {
    // 轨迹模式下不聚合
    if (this.data.showTrajectory) return;

    const allMarkers = this.jsData.markers || [];
    if (allMarkers.length === 0) return;

    // 高缩放级别：还原所有猫 marker
    if (scale == null || scale >= this.data.clusterThreshold) {
      // 当前显示的若已是完整列表（无聚合 marker），跳过，避免无谓刷新
      const hasCluster = (this.data.markers || []).some(m => m._isCluster);
      const isFullList = !hasCluster && this.data.markers.length === allMarkers.length;
      if (!isFullList) {
        this.setData({ markers: allMarkers });
      }
      return;
    }

    // 低缩放级别：聚合
    const clusters = this._clusterMarkers(allMarkers, scale);

    // 收集需要生成图标的数量
    const needGen = new Set();
    clusters.forEach(c => {
      if (c.members.length > 1 && !this.jsData.clusterIconCache[c.members.length]) {
        needGen.add(c.members.length);
      }
    });

    // 先异步生成缺失的数量圈图标
    if (needGen.size > 0) {
      const query = wx.createSelectorQuery();
      const canvasRes = await new Promise(resolve => {
        query.select('#avatarCanvas').fields({ node: true, size: true }).exec(resolve);
      });
      const canvas = canvasRes && canvasRes[0] && canvasRes[0].node;
      if (canvas) {
        for (const count of needGen) {
          if (this.jsData.clusterIconCache[count]) continue;
          const path = await this._drawClusterIcon(canvas, count);
          if (path) this.jsData.clusterIconCache[count] = path;
        }
      }
    }

    // 生成聚合后的 markers
    const clusteredMarkers = clusters.map((c, i) => {
      if (c.members.length === 1) {
        return c.members[0];
      }
      const lat = c.members.reduce((s, m) => s + (m.latitude || 0), 0) / c.members.length;
      const lng = c.members.reduce((s, m) => s + (m.longitude || 0), 0) / c.members.length;
      const count = c.members.length;
      return {
        id: 100000 + i,
        latitude: lat,
        longitude: lng,
        width: 50,
        height: 50,
        iconPath: this.jsData.clusterIconCache[count],
        anchor: { x: 0.5, y: 0.5 },
        _isCluster: true,
        _clusterCount: count,
      };
    });

    this.setData({ markers: clusteredMarkers });
  },

  /**
   * 简单距离阈值聚类
   * @param {Array} markers  完整猫 markers
   * @param {Number} scale   当前地图缩放
   * @return {Array<{members: Array}>} 聚类结果
   */
  _clusterMarkers(markers, scale) {
    // 根据 scale 计算聚合阈值（单位：度，约略）
    // 经验值：scale 13 → 0.005°（~500m）；scale 11 → 0.02°（~2km）；scale 10 → 0.04°（~4km）
    const threshold = 0.04 / Math.pow(2, scale - 10);

    const clusters = [];
    const used = new Array(markers.length).fill(false);

    for (let i = 0; i < markers.length; i++) {
      if (used[i] || markers[i].latitude == null || markers[i].longitude == null) continue;
      const cluster = { members: [markers[i]] };
      used[i] = true;
      for (let j = i + 1; j < markers.length; j++) {
        if (used[j] || markers[j].latitude == null || markers[j].longitude == null) continue;
        if (this._geoDelta(markers[i].latitude, markers[i].longitude,
                           markers[j].latitude, markers[j].longitude) < threshold) {
          cluster.members.push(markers[j]);
          used[j] = true;
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  },

  // 近似经纬度差（度），用于聚合判断；小范围内用欧氏距离 + 经度纬度修正
  _geoDelta(lat1, lng1, lat2, lng2) {
    const dLat = lat1 - lat2;
    const dLng = (lng1 - lng2) * Math.cos((lat1 + lat2) * Math.PI / 360);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  },

  // 用 Canvas 生成数量圈图标：橙色圆形 + 白色数字
  _drawClusterIcon(canvas, count) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 3000);
      try {
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        const text = String(count);
        const size = 50;  // 直径 px

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        // 白色外圈（边框）
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // 橙色内圈
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FF6B35';
        ctx.fill();

        // 白色数字（数字越多字号越小）
        const fontSize = text.length >= 3 ? 18 : (text.length === 2 ? 20 : 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, size / 2, size / 2 + 1);

        wx.canvasToTempFilePath({
          canvas,
          destWidth: size * dpr,
          destHeight: size * dpr,
          success: (res) => {
            clearTimeout(timeout);
            resolve(res.tempFilePath);
          },
          fail: () => {
            clearTimeout(timeout);
            resolve(null);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  },

  // 切换校区按钮展开/折叠
  toggleCampusBtns() {
    this.setData({ campusBtnExpanded: !this.data.campusBtnExpanded });
  },

  // 点击地图任意位置 → 折叠校区按钮
  onMapTap() {
    if (this.data.campusBtnExpanded) {
      this.setData({ campusBtnExpanded: false });
    }
  },

  locateToCampus(e) {
    var campus = e.currentTarget.dataset.campus;
    var centers = this.jsData.campusCenters;
    var c = centers && centers[campus];
    if (!c) return;
    var newScale = c.scale || 14;
    // 主动更新 currentScale 并按目标 scale 应用聚合（编程式缩放不依赖 regionchange）
    this.jsData.currentScale = newScale;
    this.setData({
      latitude: c.latitude,
      longitude: c.longitude,
      scale: newScale,
      campusBtnExpanded: false,  // 选中后折叠
    });
    this._applyCluster(newScale);
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
  },

  // 展示当前猫的轨迹（从 inter 表读取）
  async showTrajectory() {
    const catId = this.data.currentCat?._id;
    if (!catId) return;

    try {
      const { result: res } = await app.mpServerless.function.invoke('unionOp', {
        unionAction: 'getCatTrajectory',
        cat_id: catId,
      });

      const points = (res && res.success && res.data) || [];
      if (points.length < 2) {
        wx.showToast({ title: '该猫咪还没有足够的轨迹数据', icon: 'none' });
        // 兜底：用实际去重后的点数修正 trajectory_count，
        // 让"查看轨迹"按钮消失，并同步到 catList 避免下次再显示
        const realCount = points.length;
        this.setData({ 'currentCat.trajectory_count': realCount });
        const cat = this.jsData.catList.find(c => (c.cat_id || c._id) === catId);
        if (cat) cat.trajectory_count = realCount;
        return;
      }

      // 格式化时间：2x年x月x日
      const formattedPoints = points.map((p, i) => ({
        ...p,
        formatted_time: this._formatTrajectoryDate(p.location_time, i),
      }));

      // 生成轨迹点 markers：主题色框 + 红色点
      // 先用 Canvas 生成带序号和日期的自定义 marker 图片
      const markers = await this._generateTrajectoryMarkers(formattedPoints);

      // 生成 polyline：红线连接所有点
      const polyline = [{
        points: formattedPoints.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
        color: '#E74C3C',
        width: 4,
        dottedLine: false,
        arrowLine: true,
      }];

      // 计算视野：包含所有点
      const lats = formattedPoints.map(p => p.latitude);
      const lngs = formattedPoints.map(p => p.longitude);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

      // 保存当前猫信息，供轨迹 marker 点击时使用
      const curCat = this.data.currentCat;
      this.jsData.trajectoryCatId = catId;
      this.jsData.trajectoryCatName = curCat?.name || '';
      this.jsData.trajectoryCatCampus = curCat?.campus || '';
      this.jsData.trajectoryCatArea = curCat?.area || '';
      this.jsData.trajectoryCatAdopt = curCat?.adopt || '0';
      this.jsData.trajectoryCatToStar = curCat?.to_star || false;
      this.jsData.trajectoryCatAvatar = curCat?.avatarUrl || '';

      // 关闭详情卡，直接展示地图
      this.setData({
        showDetail: false,
        showTrajectory: true,
        markers: markers,
        trajectoryPoints: formattedPoints,
        trajectoryMarkers: markers,
        trajectoryPolyline: polyline,
        latitude: centerLat,
        longitude: centerLng,
      });
    } catch (err) {
      console.error('加载轨迹失败:', err);
      wx.showToast({ title: '加载轨迹失败', icon: 'none' });
    }
  },

  // 格式化轨迹日期："[序号] YY/M/D"
  _formatTrajectoryDate(isoStr, index) {
    if (!isoStr) return `[${index + 1}] 未知日期`;
    const d = new Date(isoStr);
    const year = String(d.getFullYear()).slice(-2);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `[${index + 1}] ${year}/${month}/${day}`;
  },

  // 用 Canvas 生成轨迹点自定义 marker 图片
  // 每个 marker：主题色圆角框 + 文字"{序号}. {日期}" + 红色圆点
  async _generateTrajectoryMarkers(points) {
    const query = wx.createSelectorQuery();
    let canvas = null;
    try {
      const canvasRes = await new Promise(resolve => {
        query.select('#avatarCanvas').fields({ node: true, size: true }).exec(resolve);
      });
      canvas = canvasRes && canvasRes[0] && canvasRes[0].node;
    } catch (e) {
      console.warn('获取 Canvas 失败，使用默认 marker');
    }

    const markers = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let iconPath = '/pages/public/images/map/marker_trajectory.png';

      // 用 Canvas 生成自定义 marker 图片
      if (canvas) {
        const customPath = await this._drawTrajectoryMarker(canvas, p.formatted_time, i);
        if (customPath) iconPath = customPath;
      }

      markers.push({
        id: i,
        latitude: p.latitude,
        longitude: p.longitude,
        width: 100,
        height: 36,
        iconPath: iconPath,
        anchor: { x: 0.5, y: 1 },
      });
    }
    return markers;
  },

  // 在 Canvas 上绘制单个轨迹点 marker：主题色圆角框 + 白色文字
  async _drawTrajectoryMarker(canvas, text, index) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 3000);

      try {
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        const boxHeight = 36;
        const fontSize = 12;
        const borderRadius = 8;

        // 测量文字宽度
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textWidth = ctx.measureText(text).width;
        const boxWidth = textWidth + 24; // 左右 padding
        const canvasW = boxWidth;
        const canvasH = boxHeight;

        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        ctx.scale(dpr, dpr);

        // 主题色圆角框（--color-primary: #ffd101）
        const themeColor = '#ffd101';
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.moveTo(borderRadius, 0);
        ctx.lineTo(canvasW - borderRadius, 0);
        ctx.arcTo(canvasW, 0, canvasW, borderRadius, borderRadius);
        ctx.lineTo(canvasW, boxHeight - borderRadius);
        ctx.arcTo(canvasW, boxHeight, canvasW - borderRadius, boxHeight, borderRadius);
        ctx.lineTo(borderRadius, boxHeight);
        ctx.arcTo(0, boxHeight, 0, boxHeight - borderRadius, borderRadius);
        ctx.lineTo(0, borderRadius);
        ctx.arcTo(0, 0, borderRadius, 0, borderRadius);
        ctx.closePath();
        ctx.fill();

        // 深色文字（在黄色背景上用深色，提高可读性）
        ctx.fillStyle = '#92400E';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 12, boxHeight / 2);

        // 导出临时文件
        wx.canvasToTempFilePath({
          canvas,
          destWidth: canvasW * dpr,
          destHeight: canvasH * dpr,
          success: (res) => {
            clearTimeout(timeout);
            resolve(res.tempFilePath);
          },
          fail: () => {
            clearTimeout(timeout);
            resolve(null);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  },

  // 格式化 location_time（ISO 字符串）为可读时间
  _formatLocationTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  // 还原：恢复所有猫 marker
  restoreMap() {
    this.setData({
      showTrajectory: false,
      trajectoryPoints: [],
      trajectoryMarkers: [],
      trajectoryPolyline: [],
    });
    // 立即恢复猫 markers（按当前 scale 应用聚合），避免等待 loadMapData 期间仍显示轨迹点
    const scale = this.jsData.currentScale != null ? this.jsData.currentScale : this.data.scale;
    this._applyCluster(scale);
    // 后台刷新数据（若有变化会更新）
    this.loadMapData();
  },

  // 点击时间线某点，地图定位到该点
  onTrajectoryPointTap(e) {
    const idx = e.currentTarget.dataset.index;
    const point = this.data.trajectoryPoints[idx];
    if (!this.mapCtx) {
      this.mapCtx = wx.createMapContext('campusMap', this);
    }
    this.mapCtx.moveToLocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
  },
});
