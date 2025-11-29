import { getCatStats } from "../../../utils/cloudApi";
import { text as text_cfg } from "../../../config";
import { formatDate } from "../../../utils/utils";

// 保存统计数据到本地缓存
function saveCatStatsCache(stats) {
  const cacheData = {
    timestamp: Date.now(),
    data: stats
  };
  wx.setStorageSync('catStatsCache', cacheData);
}

// 获取缓存的统计数据（有效期12小时）
function getCachedCatStats() {
  const cache = wx.getStorageSync('catStatsCache');
  if (cache && (Date.now() - cache.timestamp < 12 * 60 * 60 * 1000)) {
    return cache.data;
  }
  return null;
}

// eventType 事件标签样式
function processEvents(stats) {
  if (stats && stats.events) {
    const eventTypeMap = {
      '绝育': 'sterilized',
      '领养': 'adopted',
      '失踪': 'missing',
      '喵星': 'deceased',
      '新猫': 'newcat',
    };
    stats.events.forEach(event => {
      event.className = eventTypeMap[event.type] || '';
    });
  }
  return stats;
}

Page({
  data: {
    stats: {},
    loading: true,
    text_cfg: text_cfg,
    showUnknownCatsPopup: false,
    showEventsPopup: false,
    lastUpdateTime: null,
    selectedCampus: 0,
    maxAreaCount: 0,
    sortedAreas: [],
    sortType: 'default' // 'default', 'count', 'sterilization', 'tnr'
  },

  onLoad: function () {
    this.loadStats();
  },

  onPullDownRefresh: function() {
    this.loadStats(true).then(() => {
      wx.stopPullDownRefresh();
      // 显示刷新成功提示
      wx.showToast({
        title: '数据已更新',
        icon: 'success',
        duration: 1500
      });
    });
  },

  // 加载统计数据
  async loadStats(forceRefresh = false) {
    this.setData({ loading: true });
    
    // 如果不强制刷新，尝试从缓存加载
    if (!forceRefresh) {
      const cachedStats = getCachedCatStats();
      if (cachedStats) {
        const cache = wx.getStorageSync('catStatsCache');
        const formattedTime = formatDate(cache.timestamp, "yyyy年MM月dd日 hh:mm");
        
        this.setData({
          stats: processEvents(cachedStats),
          loading: false,
          lastUpdateTime: formattedTime
        });
        console.log("使用缓存数据，缓存时间:", formattedTime);
        this.calculateMaxAreaCount();
        return;
      }
    }
    
    // 缓存无效或强制刷新，获取新数据
    try {
      const res = await getCatStats();
      
      if (res && res.success) {
        const stats = res.data;
        
        // 保存到缓存
        saveCatStatsCache(stats);
        
        const formattedTime = formatDate(Date.now(), "yyyy年MM月dd日 hh:mm");
        
        this.setData({
          stats: processEvents(stats),
          loading: false,
          lastUpdateTime: formattedTime
        });
        console.log("获取最新统计数据:", stats, "更新时间:", formattedTime);
        this.calculateMaxAreaCount();
      } else {
        wx.showToast({
          title: '获取数据失败',
          icon: 'error'
        });
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error("获取统计数据错误:", error);
      wx.showToast({
        title: '获取数据失败',
        icon: 'error'
      });
      this.setData({ loading: false });
    }
  },

  showUnknownCatsPopup() {
    this.setData({
      showUnknownCatsPopup: true
    });
  },

  closeUnknownCatsPopup() {
    this.setData({
      showUnknownCatsPopup: false
    });
  },

  showEventsPopup() {
    if (this.data.stats.events && this.data.stats.events.length > 0) {
      this.setData({ showEventsPopup: true });
    } else {
      wx.showToast({
        title: '暂无事件记录',
        icon: 'none'
      });
    }
  },

  closeEventsPopup() {
    this.setData({ showEventsPopup: false });
  },

  // 选择校区
  selectCampus(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      selectedCampus: index
    });
    this.calculateMaxAreaCount();
    this.sortAreas();
  },

  // 显示排序选择器
  showSortPicker() {
    wx.showActionSheet({
      itemList: ['默认排序', '数量', '绝育率', 'TNR指数'],
      success: (res) => {
        let sortType = 'default';
        switch(res.tapIndex) {
          case 0:
            sortType = 'default';
            break;
          case 1:
            sortType = 'count';
            break;
          case 2:
            sortType = 'sterilization';
            break;
          case 3:
            sortType = 'tnr';
            break;
        }
        
        if (sortType !== this.data.sortType) {
          this.setData({
            sortType: sortType
          });
          this.sortAreas();
        }
      }
    });
  },

  // 排序区域数据
  sortAreas() {
    if (!this.data.stats || !this.data.stats.campus || 
        !this.data.stats.campus[this.data.selectedCampus] || 
        !this.data.stats.campus[this.data.selectedCampus].areas) {
      return;
    }

    const areas = [...this.data.stats.campus[this.data.selectedCampus].areas];
    
    // 根据排序类型排序
    switch(this.data.sortType) {
      case 'count':
        areas.sort((a, b) => b.count - a.count);
        break;
      case 'sterilization':
        areas.sort((a, b) => {
          const rateA = parseFloat(a.tnrDetail.sterilization_rate);
          const rateB = parseFloat(b.tnrDetail.sterilization_rate);
          return rateB - rateA;
        });
        break;
      case 'tnr':
        areas.sort((a, b) => {
          const tnrA = a.tnrIndex || 0;
          const tnrB = b.tnrIndex || 0;
          return tnrB - tnrA;
        });
        break;
      default:
        // 默认顺序，不做额外排序
        break;
    }

    // 如果之前有排序数据，添加动画效果
    if (this.data.sortedAreas && this.data.sortedAreas.length > 0) {
      // 记录原来的位置
      const oldOrder = {};
      this.data.sortedAreas.forEach((item, index) => {
        oldOrder[item.area] = index;
      });

      // 标记每个元素的新位置，并计算位移
      areas.forEach((item, newIndex) => {
        const oldIndex = oldOrder[item.area] !== undefined ? oldOrder[item.area] : newIndex;
        const moveDistance = (newIndex - oldIndex) * 60; // 每项高度约60rpx
        
        // 添加动画和样式
        item.animation = true;
        item.style = `transform: translateY(${moveDistance}rpx)`;
      });

      // 先设置带有动画标记的数据
      this.setData({ sortedAreas: areas });

      // 300ms后移除动画标记和样式
      setTimeout(() => {
        areas.forEach(item => {
          item.animation = false;
          item.style = '';
        });
        this.setData({ sortedAreas: areas });
      }, 300);
    } else {
      // 第一次加载，直接设置数据
      this.setData({ sortedAreas: areas });
    }
  },

  // 计算当前选中校区的最大区域猫咪数量，用于条形图显示
  calculateMaxAreaCount() {
    if (!this.data.stats || !this.data.stats.campus || 
        !this.data.stats.campus[this.data.selectedCampus] || 
        !this.data.stats.campus[this.data.selectedCampus].areas) {
      return;
    }

    const areas = this.data.stats.campus[this.data.selectedCampus].areas;
    let max = 0;
    
    for (const area of areas) {
      if (area.count > max) {
        max = area.count;
      }
    }

    this.setData({
      maxAreaCount: max === 0 ? 1 : max // 避免除以0
    });
    
    // 在计算完最大值后，进行排序
    this.sortAreas();
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: `${text_cfg.app_name} - 数据看板`
    }
  },

  onShareTimeline: function () {
    return {
      title: `${text_cfg.app_name} - 数据看板`,
    }
  },

  // 显示区域详情
  showAreaDetails(e) {
    const areaIndex = e.currentTarget.dataset.area;
    const area = this.data.sortedAreas[areaIndex];
    
    if (area) {
      this.setData({
        currentAreaDetails: area,
        showAreaDetailsPopup: true
      });
    }
  },

  // 关闭区域详情弹窗
  closeAreaDetailsPopup() {
    this.setData({
      showAreaDetailsPopup: false
    });
  }
});