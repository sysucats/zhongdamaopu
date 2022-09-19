//app.js
import { checkUpdateVersion } from "./utils";


// {
//   "pagePath": "pages/news/news",
//   "iconPath": "./images/tabs/default/sci.png",
//   "selectedIconPath": "./images/tabs/active/sci.png",
//   "text": "公告"
// },

App({
  onLaunch: function () {
    
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
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
      version: "v1.8.7"
    }
  }
})
