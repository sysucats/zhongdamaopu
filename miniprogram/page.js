import { getCacheItem, setCacheItem } from "./cache";

function _getSettingCacheKey(setting_id) {
  return `setting-${setting_id}-cache`;
}

async function _getSetting(_id) {
  const cacheKey = _getSettingCacheKey(_id);

  var cacheItem = getCacheItem(cacheKey);
  console.log(cacheKey, cacheItem);
  if (cacheItem) {
    return cacheItem;
  }

  const db = wx.cloud.database();
  cacheItem = (await db.collection('setting').doc(_id).get()).data;
  
  setCacheItem(cacheKey, cacheItem, 1);
  return cacheItem;
}

async function loadFilter() {
  return await _getSetting('filter');
}

// 获取全局的设置
async function getGlobalSettings(key) {
  var res = await _getSetting('pages');
  return res[key];
}

module.exports = {
  loadFilter,
  getGlobalSettings
}