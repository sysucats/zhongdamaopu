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
  },

  jsData: {
    catList: [],       // 猫列表（直接从 cat 集合获取）
    catMap: {},        // cat_id -> cat 信息
    avatarMap: {},     // cat_id -> avatar photo 对象
    userLocated: false, // 是否已获取用户定位
    loaded: false,      // 首次加载完成标记
    campusCenters: {},  // { campusName: { latitude, longitude, scale } }
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
        this.setData({ loading: false, markers: [] });
        return;
      }

      // catList 中每条记录格式：
      // { cat_id, name, latitude, longitude, location_time, trajectory_count, avatar, campus, area, gender, ... }
      this.jsData.catList = catList;
      this.jsData.catMap = {};
      catList.forEach(c => { this.jsData.catMap[c.cat_id] = c; });
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

    // 先用原图生成 markers，让地图尽快渲染
    const markers = catList.map((cat, index) => {
      const catId = cat.cat_id || cat._id;
      const avatar = avatarMap[catId];
      const iconPath = avatar
        ? (avatar.photo_compressed || avatar.photo_id || undefined)
        : undefined;
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

    // 异步生成圆形头像（非阻塞，完成后替换 markers 的 iconPath）
    this._renderCircleIcons(catList, avatarMap, markers);
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

    // 串行绘制（Canvas 单资源），有头像的猫才处理
    const catIdsWithAvatar = catList
      .map(c => c.cat_id || c._id)
      .filter(id => avatarMap[id] && (avatarMap[id].photo_compressed || avatarMap[id].photo_id));

    let changed = false;
    for (const id of catIdsWithAvatar) {
      const avatar = avatarMap[id];
      const url = avatar.photo_compressed || avatar.photo_id;
      const circlePath = await this.drawCircleAvatar(canvas, url);
      if (circlePath) {
        const marker = markers.find(m => m.catId === id);
        if (marker) {
          marker.iconPath = circlePath;
          changed = true;
        }
      }
    }

    // 只要有改动就更新
    if (changed) {
      this.setData({ markers: [...markers] });
    }
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

    // 普通模式：点击猫 marker，展示猫信息卡
    const catInfo = this.jsData.catList[markerId];
    if (!catInfo) return;

    const catId = catInfo.cat_id || catInfo._id;
    const avatar = catInfo.avatar || this.jsData.avatarMap[catId];

    // 组装详情数据：猫基本信息 + 头像
    // 确保 _id 字段存在（供 goToDetail 使用）
    this.setData({
      showDetail: true,
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

  closeDetail() {
    this.setData({ showDetail: false });
  },

  onRegionChange(e) {
    if (e.type === 'end' && e.causedBy === 'scale') {
      const currentScale = e.detail.scale;
      const allMarkers = this.jsData.markers || [];
      if (currentScale < 14) {
        this.setData({ markers: allMarkers.slice(0, 10) });
      } else {
        this.setData({ markers: allMarkers });
      }
    }
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
    this.setData({
      latitude: c.latitude,
      longitude: c.longitude,
      scale: c.scale || 14,
      campusBtnExpanded: false,  // 选中后折叠
    });
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
    // 重新加载所有猫 marker
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
