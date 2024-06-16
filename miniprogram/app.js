import { checkUpdateVersion, getDateWithDiffHours } from './utils/utils';
import { app_version } from "./config";

App({
  onLaunch() {
    // 检查版本
    checkUpdateVersion();

    // 清理缓存
    this.clearCache();

    this.globalData = {
      version: app_version,
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
  }
});
