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
    this.setData({
      settings
    });
  }
})