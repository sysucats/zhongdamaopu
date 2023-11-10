import { getCacheItem, setCacheItem, cacheTime } from "./cache";
import { cloud } from "./cloudAccess";

function _getSettingCacheKey(setting_id) {
  return `setting-${setting_id}-cache`;
}

async function _getSetting(_id, options) {
  const cacheKey = _getSettingCacheKey(_id);

  var cacheItem = getCacheItem(cacheKey, options);
  // console.log(cacheKey, cacheItem);
  if (cacheItem !== undefined) {
    return cacheItem;
  }

  const db = await cloud.databaseAsync();
  cacheItem = (await db.collection('setting').doc(_id).get()).data;
  
  setCacheItem(cacheKey, cacheItem, cacheTime.pageSetting);
  return cacheItem;
}

// 加载校区区域过滤器
async function loadFilter(options) {
  return await _getSetting('filter', options);
}

// 获取全局的设置
async function getGlobalSettings(key, options) {
  var res = await _getSetting('pages', options);
  if (!res) {
    return undefined;
  }

  if (key == null) {
    return res;
  }
  return res[key];
}

// 获取当前页面路径
function getCurrentPath() {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  return currentPage?.route;
}

// 切换自定义tab
function showTab(page) {
  if (typeof page.getTabBar != 'function' || !page.getTabBar()) {
    return;
  }
  
  const path = getCurrentPath();
  console.log("current path:", path);
  page.getTabBar().setData({
    activePath: path,
  });

  var tabBarHeight = wx.getStorageSync('tabBarHeight') || 80;
  page.setData({
    tabBarHeight: tabBarHeight
  })
}

// 跳转到设置页，并发起提示
function toSettings(tip) {
  const curPath = getCurrentPath();
  const url = "pages/manage/pageSettings/pageSettings";
  if (curPath == url) {
    return;
  }
  wx.navigateTo({
    url: `/${url}?tip=${encodeURIComponent(tip)}`,
  })
}
module.exports = {
  loadFilter,
  getGlobalSettings,
  showTab,
  getCurrentPath,
  toSettings,
}