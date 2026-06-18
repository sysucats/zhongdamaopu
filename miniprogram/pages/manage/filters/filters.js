import { checkAuth } from "../../../utils/user";
import { loadFilter } from "../../../utils/page";
import api from "../../../utils/cloudApi";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    filters: [],
    campusCenters: {},
    campusCenterStrs: {},
    pageMetaStyle: '',       // 地图选点时锁定页面滚动
    // 地图选点
    mapPickerVisible: false,
    mapPickerCampus: '',
    mapPickerInitLat: 23.1026,  // 地图初始中心（绑定到 map 组件，创建后不变）
    mapPickerInitLng: 113.2996,
    mapPickerLat: 23.1026,      // 拖拽追踪坐标（用于显示与保存）
    mapPickerLng: 113.2996,
    mapPickerInitScale: 14,     // 地图初始缩放（绑定到 map 组件，只有按钮改变它）
    mapPickerScale: 14,         // 追踪缩放（用于显示与保存）
    mapPickerHasCenter: false,   // 当前校区是否已有中心坐标
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await checkAuth(this, 2)) {
      await this.reloadFilter();
    }
  },

  // 加载数据库里的filters，应该只有一个
  async reloadFilter() {
    wx.showLoading({
      title: '加载中...',
    });
    var filterRes = await loadFilter({ nocache: true });
    var filters = [];
    var area_item = {
      key: 'area',
      cateKey: 'campus',
      name: '区域',
      category: [],
    };
    // 用个object当作字典，把area分下类
    var classifier = {};
    for (let i = 0, len = filterRes.campuses.length; i < len; ++i) {
      classifier[filterRes.campuses[i]] = {
        name: filterRes.campuses[i],
        items: [],    // 记录属于这个校区的area
        adding: false,
      };
    }
    for (let k = 0, len = filterRes.area.length; k < len; ++k) {
      classifier[filterRes.area[k].campus].items.push(filterRes.area[k]);
    }
    for (let i = 0, len = filterRes.campuses.length; i < len; ++i) {
      area_item.category.push(classifier[filterRes.campuses[i]]);
    }
    filters.push(area_item);

    var colour_item = {
      key: 'colour',
      name: '花色',
      category: [{
        name: '花色',
        items: filterRes.colour.map(name => {
          return { name: name };
        }),
        adding: false,
      }]
    }
    filters.push(colour_item);
    console.log("[reloadFilter] -", filters);
    // 加载校区中心坐标
    var centers = filterRes.campusCenters || {};
    var centerStrs = {};
    for (var i = 0; i < filterRes.campuses.length; i++) {
      var c = centers[filterRes.campuses[i]];
      if (c) {
        centerStrs[filterRes.campuses[i]] = c.latitude.toFixed(6) + ', ' + c.longitude.toFixed(6) + ' | ' + c.scale + '级';
      }
    }
    this.setData({
      filters: filters,
      campusCenters: centers,
      campusCenterStrs: centerStrs
    })
    wx.hideLoading();
  },

  // ==================== 校区中心坐标地图选点 ====================

  // 打开地图选点
  openMapPicker(e) {
    var campus = e.currentTarget.dataset.campus;
    var centers = this.data.campusCenters;
    var lat, lng, scale;
    if (centers && centers[campus]) {
      var c = centers[campus];
      lat = c.latitude; lng = c.longitude; scale = c.scale;
    } else {
      // 默认广州中山大学东校园中心
      lat = 23.1026; lng = 113.2996; scale = 14;
    }
    this.setData({
      mapPickerVisible: true,
      pageMetaStyle: 'overflow: hidden;',
      mapPickerCampus: campus,
      mapPickerHasCenter: !!(centers && centers[campus]),
      mapPickerInitLat: lat,    // 初始中心，创建 map 后不再变动
      mapPickerInitLng: lng,
      mapPickerInitScale: scale, // 初始缩放，仅按钮改变
      mapPickerLat: lat,        // 追踪当前坐标
      mapPickerLng: lng,
      mapPickerScale: scale,
    });
  },

  // 地图区域变化（拖拽/缩放结束）—— 仅更新追踪坐标，不触动 map 组件绑定值
  onMapRegionChange(e) {
    if (e.type === 'end') {
      var lat, lng, scale;
      if (e.detail && e.detail.centerLocation) {
        lat = e.detail.centerLocation.latitude;
        lng = e.detail.centerLocation.longitude;
        // scale = this.data.mapPickerInitScale;
        console.log(lat, lng);
        this.setData({
          mapPickerLat: lat,
          mapPickerLng: lng,
          // mapPickerScale: scale,
        });
      } else {
        // 降级：通过 MapContext 获取
        var that = this;
        var mapCtx = wx.createMapContext('campusMapPicker');
        mapCtx.getCenterLocation({
          success: function (res) {
            that.setData({
              mapPickerLat: res.latitude,
              mapPickerLng: res.longitude,
            });
          }
        });
        mapCtx.getScale({
          success: function (res) {
            that.setData({ mapPickerScale: res.scale });
          }
        });
      }
    }
  },

  // 确认选择坐标
  async confirmMapPicker() {
    var campusCenters = this.data.campusCenters || {};
    campusCenters[this.data.mapPickerCampus] = {
      latitude: this.data.mapPickerLat,
      longitude: this.data.mapPickerLng,
      scale: this.data.mapPickerScale,
    };
    var centerStrs = this.data.campusCenterStrs || {};
    centerStrs[this.data.mapPickerCampus] =
      this.data.mapPickerLat.toFixed(6) + ', ' + this.data.mapPickerLng.toFixed(6) + ' | ' + this.data.mapPickerScale + '级';

    wx.showLoading({ title: '保存中...' });
    await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "filter",
      data: { campusCenters: campusCenters }
    });
    this.setData({
      campusCenters: campusCenters,
      campusCenterStrs: centerStrs,
      mapPickerVisible: false,
      mapPickerHasCenter: true,
      pageMetaStyle: '',
    });
    wx.hideLoading();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  // 取消选点
  cancelMapPicker() {
    this.setData({ mapPickerVisible: false, mapPickerHasCenter: false, pageMetaStyle: '' });
  },

  // 删除当前校区的中心坐标
  async deleteCampusCenter() {
    var campus = this.data.mapPickerCampus;
    var campusCenters = this.data.campusCenters || {};
    var campusCenterStrs = this.data.campusCenterStrs || {};
    delete campusCenters[campus];
    delete campusCenterStrs[campus];

    wx.showLoading({ title: '删除中...' });
    await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "filter",
      data: { campusCenters: campusCenters }
    });
    this.setData({
      campusCenters: campusCenters,
      campusCenterStrs: campusCenterStrs,
      mapPickerVisible: false,
      pageMetaStyle: '',
    });
    wx.hideLoading();
    wx.showToast({ title: '已删除坐标', icon: 'success' });
  },

  // 地图缩放 +
  zoomMapIn() {
    var s = this.data.mapPickerInitScale;
    console.log("S", s);
    if (s < 18) {
      var ns = s + 1;
      console.log("NS", ns);
      this.setData({
        mapPickerInitScale: ns,
        mapPickerScale: ns,
      });
    }
  },

  // 地图缩放 −
  zoomMapOut() {
    var s = this.data.mapPickerInitScale;
    console.log("S", s);
    if (s > 3) {
      var ns = s - 1;
      console.log("NS", ns);
      this.setData({
        mapPickerInitScale: ns,
        mapPickerScale: ns,
      });
    }
  },

  // ==================== 校区管理 ====================

  async loadCampus() {

  },

  // 增加option
  addOptionInput(e) {
    const filters_sub = e.currentTarget.dataset.filterssub;
    const index = e.currentTarget.dataset.cateindex;
    var filters = this.data.filters;
    var category = filters[filters_sub].category[index];
    category.adding = true;
    this.setData({ filters: filters });
  },

  async addOptionConfirm(e) {
    var filters = this.data.filters;

    const name = e.detail.value.name;
    const filters_sub = e.currentTarget.dataset.filterssub;
    const index = e.currentTarget.dataset.cateindex;
    var mainF = filters[filters_sub]
    var category = mainF.category[index];

    if (name == '') { // 名字不能为空
      return false;
    }
    for (let k = 0, length = category.items.length; k < length; ++k) {   // 检查类内有无重名
      if (name == category.items[k].name) {
        wx.showToast({
          title: '名字不能重复',
          icon: 'none'
        })
        return false;
      }
    }
    category.items.push({
      name: name,
      campus: category.name
    })
    category.adding = false;
    this.setData({ filters: filters });
    await this.uploadFilters();
  },

  // 移动、管理option
  async moveOption(e) {
    var filters = this.data.filters;

    const filters_sub = e.currentTarget.dataset.filterssub;
    const cateindex = e.currentTarget.dataset.cateindex;
    const index = e.currentTarget.dataset.innerindex;
    const direct = e.currentTarget.dataset.direct; // 'up' or 'down'

    const category = filters[filters_sub].category[cateindex];

    const len = category.items.length;
    const new_index = (direct === 'up') ? index - 1 : index + 1;
    if (new_index < 0 || new_index >= len) {
      return false;
    }
    console.log("[moveOption] -", direct);
    const temp = category.items[index];
    category.items[index] = category.items[new_index];
    category.items[new_index] = temp;
    this.setData({ filters: filters });
    await this.uploadFilters();
  },

  async deleteOption(e) {
    wx.showLoading({
      title: '检查中...',
      mask: true
    });
    var filters = this.data.filters;

    const filters_sub = e.currentTarget.dataset.filterssub;
    const cateindex = e.currentTarget.dataset.cateindex;
    const index = e.currentTarget.dataset.innerindex;

    const mainF = filters[filters_sub];
    const category = mainF.category[cateindex];
    const delete_value = category.items[index];

    // 检查一下数据库里这个地址有没有猫，如果有就不能删
    var qf = { [mainF.key]: category.items[index].name, deleted: { $ne: 1 } };
    if (mainF.cateKey) {
      qf[mainF.cateKey] = category.name;
    }
    var { result: catCountRes } = await app.mpServerless.db.collection('cat').count(qf)
    console.log("[deleteOption] -", catCountRes);
    if (catCountRes) {
      wx.showToast({
        title: '无法删除有猫猫的选项',
        icon: 'none',
      });
      return false;
    }
    // 执行删除
    category.items = category.items.filter(val => val != delete_value);
    this.setData({ filters: filters }, () => {
      wx.showToast({
        title: '删除成功',
      });
    });

    await this.uploadFilters();
  },

  // 确定上传
  async uploadFilters() {
    var filters = this.data.filters;
    // 开始上传
    wx.showLoading({
      title: '正在上传...',
    });
    console.log("[uploadFilters] -", filters);
    // 处理回数据库中的原始格式
    var area = [];
    var colour = [];
    for (const mainF of filters) {
      for (const category of mainF.category) {
        for (const item of category.items) {
          if (mainF.key == 'area') {
            area.push({
              name: item.name,
              campus: item.campus,
            });
          } else if (mainF.key == 'colour') {
            colour.push(item.name);
          }
        }
      }
    }
    await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "filter",
      data: {
        area: area,
        colour: colour
      }
    });
    await this.reloadFilter();
  },

  async addCampus() {
    this.setData({
      addingCampus: true,
    })
  },
  async addCampusConfirm(e) {
    const category = this.data.filters[0].category;
    const name = e.detail.value.name;

    if (name == '') { // 名字不能为空
      return false;
    }

    let uploadCampus = [];
    for (let k = 0; k < category.length; ++k) {
      // 检查类内有无重名
      const tmp = category[k].name;
      if (name == tmp) {
        wx.showToast({
          title: '名字不能重复',
          icon: 'none'
        })
        return false;
      }
      uploadCampus.push(tmp);
    }
    uploadCampus.push(name);

    // 直接上传
    await this.doUploadCampus(uploadCampus);

    this.setData({
      addingCampus: false,
    });
  },

  async deleteCampus(e) {
    const category = this.data.filters[0].category;
    const { cateindex } = e.currentTarget.dataset;
console.log("删除111", category);
console.log("删除", cateindex);
    let uploadCampus = [];
    for (let k = 0; k < category.length; ++k) {
      if (k == cateindex) {
        // 即将删除的，如果有存在区域，就不能删除
        if (category[k].items.length) {
          wx.showToast({
            title: '有区域无法删除',
            icon: 'error'
          })
          return false;
        }
        continue;
      }
      const tmp = category[k].name;
      uploadCampus.push(tmp);
    }

    // 上传
    console.log("删除", uploadCampus);
    await this.doUploadCampus(uploadCampus);
  },

  async doUploadCampus(data) {
    wx.showLoading({
      title: '更新中...',
    });

    // 清理 campusCenters：只保留仍然存在的校区
    var campusCenters = this.data.campusCenters || {};
    var cleanCenters = {};
    for (var k = 0; k < data.length; k++) {
      if (campusCenters[data[k]]) {
        cleanCenters[data[k]] = campusCenters[data[k]];
      }
    }

    await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "filter",
      data: {
        campuses: data,
        campusCenters: cleanCenters,
      }
    });
    await this.reloadFilter();
  }
})