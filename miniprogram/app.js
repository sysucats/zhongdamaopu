import { checkUpdateVersion, getDateWithDiffHours } from './utils/utils';
import { app_version } from "./config";
import { ensureCos } from './utils/common';
import { app_id, space_id, space_secret, space_endpoint } from './config'
import eventBus from './utils/eventBus';
import { createMockMpServerless } from './utils/demo';

let mpServerless;
let demoMode = false;

// 尝试加载 EMAS SDK（npm 包可能未安装）
try {
  var MPServerless = require('@alicloud/mpserverless-sdk');
  mpServerless = new MPServerless({
    uploadFile: wx.uploadFile,
    request: wx.request,
    getAuthCode: wx.login,
    getFileInfo: wx.getFileInfo,
    getImageInfo: wx.getImageInfo,
  }, {
    appId: app_id,
    spaceId: space_id,
    clientSecret: space_secret,
    endpoint: space_endpoint,
  });
  mpServerless.init();
  console.log('EMAS 初始化成功');
} catch (e) {
  console.warn('EMAS SDK 未安装或初始化失败，进入离线 Demo 模式:', e.message);
  mpServerless = createMockMpServerless();
  demoMode = true;
}

App({
  async onLaunch() {
    if (!demoMode) {
      try {
        this.cos = await ensureCos();
      } catch (e) {
        console.warn('COS 初始化失败:', e.message);
      }
    }

    checkUpdateVersion();
    this.clearCache();

    this.globalData = {
      version: app_version,
      eventBus: eventBus,
      demoMode: demoMode,
    };
  },

  clearCache() {
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
