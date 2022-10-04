// 放置与cat对象有关的函数
const utils = require('./utils.js');
const cache = require('./cache.js');

// 常用的一些对象
const db = wx.cloud.database();
const _ = db.command;
const coll_photo = db.collection('photo');
const coll_cat = db.collection('cat');

// 获取猫猫的封面图
async function getAvatar(cat_id, total) {
  if (!total || total === 0) {
    return undefined;
  }

  var cacheKey = `cat-avatar-${cat_id}`;
  var cacheItem = cache.getCacheItem(cacheKey);
  console.log(cacheKey, cacheItem);
  if (cacheItem) {
    return cacheItem;
  }
  
  // photo_id : 不以 HEIC 为文件后缀的字符串
  const qf = {
    cat_id: cat_id,
    verified: true,
    best: true,
    photo_id: /^((?!\.heic$).)*$/i
  };

  // TODO: 这里对于API调用的次数较多，需要修改
  var index = utils.randomInt(0, total);
  var pho_src = (await coll_photo.where(qf).skip(index).limit(1).get()).data;
  cacheItem = pho_src[0];
  
  cache.setCacheItem(cacheKey, cacheItem, 24);
  return cacheItem;
}

// 消除“有新相片”提示
function getVisitedDate(cat_id) {
  const key = "visit-cat-" + cat_id;
  return cache.getCacheDate(key);
}
function setVisitedDate(cat_id) {
  const key = "visit-cat-" + cat_id;
  cache.setCacheDate(key);
  return;
}

// 获取猫猫信息
async function getCatItem(cat_id) {
  if (!cat_id) {
    return undefined;
  }
  var cacheKey = `cat-item-${cat_id}`;
  var cacheItem = cache.getCacheItem(cacheKey);
  if (cacheItem) {
    return cacheItem;
  }

  cacheItem = (await coll_cat.doc(cat_id).get()).data;
  cache.setCacheItem(cacheKey, cacheItem, 24);
  return cacheItem;
}

// 获取多个猫猫信息
async function getCatItemMulti(cat_ids) {
  if (!cat_ids) {
    return undefined;
  }
  var res = {};
  var not_found = [];
  for (var cat_id of cat_ids) {
    var cacheKey = `cat-item-${cat_id}`;
    var cacheItem = cache.getCacheItem(cacheKey);
    if (cacheItem) {
      res[cat_id] = cacheItem;
      continue;
    }
    not_found.push(cat_id);
  }

  var db_res = (await coll_cat.where({_id: _.in(not_found)}).get()).data;
  for (var c of db_res) {
    var cacheKey = `cat-item-${c._id}`;
    cache.setCacheItem(cacheKey, c, 24);
    res[c._id] = c;
  }
  
  return cat_ids.map(x => res[x]);
}

export {
  getAvatar,
  getVisitedDate,
  setVisitedDate,
  getCatItem,
  getCatItemMulti
}