import { getCacheItem, setCacheItem, cacheTime } from "./cache";

function _getSettingCacheKey(setting_id) {
  return `setting-${setting_id}-cache`;
}

async function _getSetting(_id, options) {
  const cacheKey = _getSettingCacheKey(_id);

  var cacheItem = getCacheItem(cacheKey, options);
  console.log(cacheKey, cacheItem);
  if (cacheItem) {
    return cacheItem;
  }

  const db = wx.cloud.database();
  cacheItem = (await db.collection('setting').doc(_id).get()).data;
  
  setCacheItem(cacheKey, cacheItem, cacheTime.pageSetting);
  return cacheItem;
}

async function loadFilter(options) {
  return await _getSetting('filter', options);
}

// 获取全局的设置
async function getGlobalSettings(key, options) {
  var res = await _getSetting('pages', options);
  return res[key];
}

module.exports = {
  loadFilter,
  getGlobalSettings
}