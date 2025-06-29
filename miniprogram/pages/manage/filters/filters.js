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
    this.setData({
      filters: filters
    })
    wx.hideLoading();
  },

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
    var qf = { [mainF.key]: category.items[index].name };
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

    await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "filter",
      data: {
        campuses: data,
      }
    });
    await this.reloadFilter();
  }
})