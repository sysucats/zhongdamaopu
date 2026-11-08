// pages/manage/pageSettings/pageSettings.js
import { checkAuth } from "../../../utils/user";
import { getGlobalSettings } from "../../../utils/page";
import api from "../../../utils/cloudApi";
import desc from "./desc";

// 识猫相关设置已集中到「识猫服务」页（pages/debug/meowid）管理。
// 本页对它们：不展示、不填默认值、提交时原样保留数据库现值——
// 防止页面配置整树 $set 时用旧值覆盖识猫服务页刚保存的修改（这就是重复+错乱的根源）。
// recognize_test 组和 recognize.interfaceURL 是数据库历史遗留，一并隐藏。
const HIDDEN_RECOGNIZE_GROUPS = ["recognize", "recognize_test"];
const HIDDEN_RECOGNIZE_ADS_FIELDS = ["recognize_banner", "recognize_video"];

// 从 settings 树里摘出识猫相关字段（深拷贝），返回 { groups, adsFields }
function pickHiddenRecognition(settings) {
  const groups = {};
  for (const g of HIDDEN_RECOGNIZE_GROUPS) {
    if (settings[g] !== undefined) {
      groups[g] = JSON.parse(JSON.stringify(settings[g]));
      delete settings[g];
    }
  }
  const adsFields = {};
  if (settings.ads) {
    for (const f of HIDDEN_RECOGNIZE_ADS_FIELDS) {
      if (settings.ads[f] !== undefined) {
        adsFields[f] = settings.ads[f];
        // 摘出渲染树：页面配置不再显示这两个字段（desc.js 已无描述，否则渲染成"未知字段"）。
        // 值保存在 adsFields，提交时由 uploadSetting 合并回 ads，不会丢失。
        delete settings.ads[f];
      }
    }
  }
  return { groups, adsFields };
}


Page({
  /**
   * 页面的初始数据
   */
  data: {
    settings: {},
    desc,
  },

  jsData: {
    // 页面配置不展示、但提交时需要原样写回的识猫字段（防止覆盖识猫服务页的修改）
    hiddenRecognition: null,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    if (await checkAuth(this, 99)) {
      await this.reloadSettings();
      if (options.tip) {
        wx.showModal({
          title: "请修改设置",
          content: decodeURIComponent(options.tip),
          showCancel: false
        });
      }
    }
  },


  setDefaultValues(settings) {
    let shouldUpload = false;
    for (const i in desc) {
      for (const j in desc[i]) {
        var defaultValue = desc[i][j].default;
        if (defaultValue == undefined) {
          continue;
        }
        if (typeof defaultValue === "string" && defaultValue.startsWith("#copy")) {
          var [_, ci, cj] = defaultValue.split("-");
          defaultValue = settings[ci][cj];
        }
        if (settings[i] == undefined) {
          shouldUpload = true;
          settings[i] = {}
        }
        if (settings[i][j] == undefined) {
          settings[i][j] = defaultValue;
        }
      }
    }

    if (shouldUpload) {
      this.uploadSetting();
    }
  },

  // 排序一下Map，target为需要排序的东西，example是参考的标准
  sortMap(target, example) {
    if (typeof target !== "object") {
      return target;
    }
    var res = {};
    for (const key in example) {
      if (target[key] === undefined) {
        continue;
      }
      res[key] = this.sortMap(target[key], example[key]);
    }

    for (const key in target) {
      if (res[key] === undefined) {
        res[key] = target[key];
      }
    }

    return res;
  },

  // 加载数据库设置
  async reloadSettings() {
    let settings = await getGlobalSettings(null, { nocache: true });
    console.log(JSON.stringify(settings));
    delete settings._id;
    delete settings.openid;
    delete settings.mdate;
    // 摘出识猫字段：不展示、不参与默认值填充；提交时原样合并回库
    this.jsData.hiddenRecognition = pickHiddenRecognition(settings);
    this.setDefaultValues(settings);
    settings = this.sortMap(settings, desc);
    for (const i in settings) {
      if (desc[i] == undefined) {
        desc[i] = {
          tip: "未知配置，请在desc.js中添加描述",
        }
      }
      for (const j in settings[i]) {
        // console.log(desc[i][j], settings[i][j])
        if (desc[i][j] == undefined) {
          desc[i][j] = {
            tip: "未知字段，请在desc.js中添加描述，该值无法被修改",
            type: "origin",
            disabled: true,
          }
        }
      }
    }
    this.setData({
      settings,
      desc
    });
  },

  // 获取输入
  inputChange(e) {
    var { i, j } = e.currentTarget.dataset;
    var { value } = e.detail;
    this.setData({
      [`settings.${i}.${j}`]: value
    });
  },

  // 获取checkBox输入
  checkBoxChange(e) {
    var { i, j } = e.currentTarget.dataset;
    var { value } = e.detail;
    this.setData({
      [`settings.${i}.${j}`]: value.join(",")
    });
  },

  // 获取switch输入
  switchChange(e) {
    var { i, j } = e.currentTarget.dataset;
    var { value } = e.detail;
    this.setData({
      [`settings.${i}.${j}`]: value
    });
  },

  // 检查设置类型有效
  checkAvaliable() {
    var { settings, desc } = this.data;
    for (const i in settings) {
      for (const j in settings[i]) {
        const type = desc[i][j].type;
        var value = settings[i][j];
        // console.log(i, j, value, type);
        if (type == "number") {
          if (isNaN(value)) {
            wx.showModal({
              title: '提示',
              content: `字段${i}.${j}无效，值为"${value}"`,
              showCancel: false
            });
            return false;
          }
          settings[i][j] = parseFloat(value);
        }
        if (type == "bool") {
          // 规范化为布尔值，兼容历史数据中可能存的字符串 "true"/"false"
          settings[i][j] = (value === true || value === "true");
        }
        // 不允许关闭info Tabbar，以防不能再调回去
        if (i == "tabBarCtrl") {
          if ((j == "ctrlTab" && value.includes("info")) || (j == "fullTab" && !value.includes("info"))) {
            wx.showModal({
              title: '提示',
              content: `不可隐藏关于页`,
              showCancel: false
            });
            return false;
          }
        }
      }
    }

    return true;
  },

  // 上传设置
  async uploadSetting() {
    if (!await this.checkAvaliable()) {
      return false;
    }

    wx.showLoading({
      title: '上传中...',
    })

    const { settings } = this.data;

    // 把识猫相关字段原样合并回去：这些字段由识猫服务页管理，
    // 本页不展示也不修改，提交时保留数据库现值，避免整树 $set 覆盖
    const merged = Object.assign({}, settings);
    const hidden = this.jsData.hiddenRecognition;
    if (hidden) {
      for (const g of Object.keys(hidden.groups)) {
        merged[g] = hidden.groups[g];
      }
      if (hidden.adsFields && Object.keys(hidden.adsFields).length) {
        merged.ads = Object.assign({}, settings.ads, hidden.adsFields);
      }
    }

    const res = await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "pages",
      data: merged
    })
    if (res.ok) {
      wx.showToast({
        title: '保存成功',
        icon: "success"
      });
      await this.reloadSettings();
    }
  },

})