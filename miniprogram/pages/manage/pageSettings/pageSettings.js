// pages/manage/pageSettings/pageSettings.js
import { checkAuth } from "../../../user";
import desc from "./desc";

const db = wx.cloud.database();
const _ = db.command;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    settings: {},
    desc,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    if (await checkAuth(this, 99)) {
      await this.reloadSettings();
    }
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 加载数据库设置
  async reloadSettings() {
    const settings = (await db.collection("setting").doc("pages").get()).data;
    console.log(JSON.stringify(settings));
    delete settings._id;
    delete settings.openid;
    this.setData({
      settings
    });
  },

  // 获取输入
  inputChange(e) {
    var {i, j} = e.currentTarget.dataset;
    var {value} = e.detail;
    this.setData({
      [`settings.${i}.${j}`]: value
    });
  },

  // 检查设置类型有效
  checkAvaliable() {
    var {settings, desc} = this.data;
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

    await wx.cloud.callFunction({
      name: "updateSetting",
      data: {
        doc_id: "pages",
        to_upload: settings
      }
    })

    wx.showToast({
      title: '保存成功',
      icon: "success"
    })
  },
})