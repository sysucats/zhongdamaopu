// 放置与cat对象有关的函数
import { randomInt } from "./utils";
import { getCacheItem, setCacheItem, getCacheDate, setCacheDate, cacheTime } from "./cache";
const app = getApp();

// 获取猫猫的封面图
async function getAvatar(cat_id, total) {
  if (!total || total === 0) {
    return undefined;
  }

  var cacheKey = `cat-avatar-${cat_id}`;
  var cacheItem = getCacheItem(cacheKey);
  if (cacheItem) {
    return cacheItem;
  }

  // photo_id : 不以 HEIC 为文件后缀的字符串
  const qf = {
    cat_id: cat_id,
    verified: true,
    best: true
  };

  var index = randomInt(0, total);

  const { result: pho_src } = await app.mpServerless.db.collection('photo').find(qf, { skip: index, limit: 1 })
  cacheItem = pho_src[0];

  setCacheItem(cacheKey, cacheItem, cacheTime.catAvatar);
  return cacheItem;
}

// 消除“有新相片”提示
function getVisitedDate(cat_id) {
  const key = "visit-cat-" + cat_id;
  return getCacheDate(key);
}
function setVisitedDate(cat_id) {
  const key = "visit-cat-" + cat_id;
  setCacheDate(key);
  return;
}

// 获取猫猫信息
async function getCatItem(cat_id, options) {
  if (!cat_id) {
    return undefined;
  }
  var cacheKey = `cat-item-${cat_id}`;
  var cacheItem = getCacheItem(cacheKey, options);
  if (cacheItem) {
    return cacheItem;
  }

  const { result } = await app.mpServerless.db.collection('cat').findOne({ _id: cat_id });
  cacheItem = result
  setCacheItem(cacheKey, cacheItem, cacheTime.catItem);
  return cacheItem;
}

// 获取多个猫猫信息
async function getCatItemMulti(cat_ids, options) {
  if (!cat_ids) {
    return undefined;
  }
  var res = {};
  var not_found = [];
  for (var cat_id of cat_ids) {
    var cacheKey = `cat-item-${cat_id}`;
    var cacheItem = getCacheItem(cacheKey, options);
    if (cacheItem) {
      res[cat_id] = cacheItem;
      continue;
    }
    not_found.push(cat_id);
  }

  // 请求没有的
  if (not_found.length > 0) {
    let db_query = [];
    for (let i = 0; i < not_found.length; i += 100) {
      const { result: db_res } = await app.mpServerless.db.collection('cat').find({ _id: { $in: not_found } }, { skip: i });
      db_query.push(db_res)
    }

    let db_res = [];
    for (const res of (await Promise.all(db_query))) {
      db_res = db_res.concat(res);
    }
    console.log("db_res", db_res);
    for (var c of db_res) {
      var cacheKey = `cat-item-${c._id}`;
      setCacheItem(cacheKey, c, cacheTime.catItem);
      res[c._id] = c;
    }
  }

  return cat_ids.map(x => res[x]);
}

// 获取所有猫猫信息（用于构造关系图）
async function getAllCats(options) {
  var cacheKey = `cat-item-ALLCATS`;
  var cacheItem = getCacheItem(cacheKey, options);
  if (cacheItem) {
    return cacheItem;
  }

  // 请求没有的
  var res = [];
  while (true) {
    const cats = (await app.mpServerless.db.collection('cat').find({}, { skip: res.length })).result;
    if (!cats || cats.length === 0) {
      break;
    }
    for (const item of cats) {
      res.push({
        _id: item._id,
        name: item.name,
        campus: item.campus,
        gender: item.gender,
        relations: item.relations
      })
    }
  }
  setCacheItem(cacheKey, res, cacheTime.catItem);

  return res;
}

export {
  getAvatar,
  getVisitedDate,
  setVisitedDate,
  getCatItem,
  getCatItemMulti,
  getAllCats
}