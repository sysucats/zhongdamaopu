// 缓存相关

function getCacheItem(key) {
  var data = wx.getStorageSync(key);
  if (!data) {
    return undefined;
  }

  // 过期了
  if (new Date() > new Date(data.expire_date)) {
    console.log(`${key} expired.`);
    return undefined;
  }

  return data.item;
}

function setCacheItem(key, item, expire_hours, expire_minutes) {
  var expire_date = new Date();
  expire_date.setHours(expire_date.getHours() + expire_hours);
  expire_date.setMinutes(expire_date.getMinutes() + (expire_minutes || 0));
  var data = {
    item: item,
    expire_date: expire_date
  };

  wx.setStorageSync(key, data);
}

function getCacheDate(key) {
  var date = wx.getStorageSync(key);
  if (!date) {
    return undefined;
  }
  return new Date(date);
}

function setCacheDate(key, date) {
  if (!date) {
    date = new Date();
  }
  wx.setStorageSync(key, date);
}

module.exports = {
  getCacheDate,
  setCacheDate,
  getCacheItem,
  setCacheItem,
}