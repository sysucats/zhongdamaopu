import { checkUpdateVersion } from './utils/utils';
import { app_version } from "./config";

App({
  onLaunch() {
    // 检查版本
    checkUpdateVersion();

    this.globalData = {
      version: app_version,
    };
  },
});
