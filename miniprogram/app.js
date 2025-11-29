import { checkUpdateVersion, getDateWithDiffHours } from './utils/utils';
import { app_version } from "./config";
import MPServerless from '@alicloud/mpserverless-sdk';
import { ensureCos } from './utils/common';
import { app_id, space_id, space_secret, space_endpoint } from './config'
import eventBus from './utils/eventBus';
const mpServerless = new MPServerless({
  uploadFile: wx.uploadFile,
  request: wx.request,
  getAuthCode: wx.login,
  getFileInfo: wx.getFileInfo,
  getImageInfo: wx.getImageInfo,
}, {
  appId: app_id, // 小程序应用标识
  spaceId: space_id, // 服务空间标识
  clientSecret: space_secret, // 服务空间 secret key
  endpoint: space_endpoint, // 服务空间地址，从小程序 serverless 控制台处获得
});
App({
  async onLaunch() {
    // 初始化 SDK
    mpServerless.init();

    // 初始化 COS
    this.cos = await ensureCos();

    // 检查版本
    checkUpdateVersion();

    // 清理缓存
    this.clearCache();

    this.globalData = {
      version: app_version,
      eventBus: eventBus
    };
  },

  clearCache() {
    // 解决长时间不打开小程序会加载失败的问题
    let clearDay = wx.getStorageSync('clear-all-cache');
    if (!clearDay || (new Date(clearDay)) < (new Date())) {
      console.log("清理所有缓存数据");
      wx.clearStorageSync();
      wx.setStorageSync('clear-all-cache', getDateWithDiffHours(48));
    } else {
      console.log("缓存仍然有效，过期时间", new Date(clearDay));
    }
  },
  mpServerless: mpServerless,
  cos: null,
});
