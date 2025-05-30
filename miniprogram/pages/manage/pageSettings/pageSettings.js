// pages/manage/pageSettings/pageSettings.js
import { checkAuth } from "../../../utils/user";
import { getGlobalSettings } from "../../../utils/page";
import api from "../../../utils/cloudApi";
import desc from "./desc";


Page({
  /**
   * 页面的初始数据
   */
  data: {
    settings: {},
    desc,
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
        if (defaultValue.startsWith("#copy")) {
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

    const res = await api.curdOp({
      operation: "update",
      collection: "setting",
      item_id: "pages",
      data: settings
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