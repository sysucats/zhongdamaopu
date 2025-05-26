import { getGlobalSettings, getCurrentPath } from "../utils/page";
import { sleep } from "../utils/utils";
import { checkCanFullTabBar } from "../utils/user";
import tab from "./tab";

function getTabBarList() {
  console.log(tab);
  var list = [];
  for (var key in tab) {
    list.push(tab[key]);
  }
  return list;
}

function isTabPath(path) {
  for (var key in tab) {
    if (tab[key]["pagePath"] === path) {
      return true;
    }
  }
  return false;
}

Component({
  data: {
    list: getTabBarList(),
    activePath: null
  },
  async created() {
    const currentPath = getCurrentPath();
    if (!currentPath) {
      await sleep(100);
    }
    const settings = await this.getSettings();
    if (settings == undefined) {
      console.log("no settings, currentPath:", currentPath);
      if (isTabPath(currentPath)) {
        wx.showModal({
          title: 'TabBar错误001',
          content: `请重进小程序。当前页面：${currentPath}`,
          showCancel: false
        });
        return;
      }
      
      this.setData({
        list: tab,
        showTabBar: true,
      });
      return;
    }
    const fullTab = settings.fullTab.split(',');
    const ctrlTab = new Map(settings.ctrlTab.split(',').map(i => [i, true]));
    var minTab = fullTab.filter(x => ctrlTab.get(x) === undefined);
    // console.log("tabBar", ctrlTab, minTab, fullTab);
    // 根据用户类型来确定底Tab
    var order = minTab;
    if (await checkCanFullTabBar() || !order) {
      order = fullTab;
    }

    if (!order && isTabPath(currentPath)) {
      console.log("no order");
      wx.showModal({
        title: 'TabBar错误002',
        content: `请重进小程序。当前页面：${currentPath}`,
        showCancel: false
      });
      return;
    }

    // 存起来其他地方可以查看
    wx.setStorageSync('tabBarOrder', order)
    
    // 重新排序list
    var newList = [];
    for (const key of order) {
      const item = tab[key.trim()];
      if (!item) {
        continue;
      }
      newList.push(item);
    }
    this.setData({
      list: newList,
      showTabBar: true,
    });
  },
  attached() {
    var obj = this.createSelectorQuery();
    obj.select('.tab-bar').boundingClientRect(function (rect) {
      console.log('获取tabBar元素的高度', rect.height);
      wx.setStorageSync('tabBarHeight', rect.height)     // 将获取到的高度设置缓存，以便之后使用
    }).exec();
  },
  methods: {
    switchTab(e) {
      const {path} = e.currentTarget.dataset;
      if (path == this.data.activePath) {
        return;
      }

      const url = `/${path}`;
      wx.switchTab({url});
    },
    
    // 带有重试机制的读取设置
    async getSettings() {
      let maxTry = 3;
      let res = undefined;
      while (res === undefined && maxTry > 0) {
        res = await getGlobalSettings("tabBarCtrl");
        maxTry --;
        await sleep(300);
      }
      return res;
    },
  }
})