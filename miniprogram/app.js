import { checkUpdateVersion } from './utils';
import { app_version } from "./config";

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      try {
        wx.cloud.init({
          traceUser: true,
        });
      } catch (error) {
        console.error(error);
      }
    }

    // 检查版本
    checkUpdateVersion();

    this.globalData = {
      version: app_version,
    };
  },
});
