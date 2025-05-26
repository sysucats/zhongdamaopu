// 缓存相关

function getCacheItem(key, options) {
  options = options || {};
  if (options.nocache) {
    console.log("nocache=true")
    return undefined;
  }

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
  expire_minutes = (expire_minutes || 0) + parseInt(expire_hours * 60);
  // expire_date.setHours(expire_date.getHours() + expire_hours);
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

// 缓存时长设置（单位默认为hours）
// TODO(zing): 缓存图片链接会导致cos签名过期
const cacheTime = {
  catAvatar: 0.1,  // 首页封面图
  catItem: 0.1,  // 猫猫信息
  commentCount: 0,  // 便利贴数量
  likeItem: 72,  // 点赞行为
  pageSetting: 24*7,  // 页面设置
  genealogyFCampus: 24*7*31,  // 首页校区过滤选项
  checkPhotoCampus: 24*7*31,  // 最后一次审核照片的校区
  genealogyNews: 0, // 首页的news弹窗
}

module.exports = {
  getCacheDate,
  setCacheDate,
  getCacheItem,
  setCacheItem,
  cacheTime
}