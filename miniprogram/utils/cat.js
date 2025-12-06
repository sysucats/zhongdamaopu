// 放置与cat对象有关的函数
import { randomInt } from "./utils";
import { signCosUrl } from "./common";
import { getCacheItem, setCacheItem, getCacheDate, setCacheDate, cacheTime } from "./cache";
const app = getApp();

// 获取猫猫的封面图（支持单猫与多猫）
async function getAvatar(ids, options) {
  const isMulti = Array.isArray(ids);
  const cat_ids = isMulti ? ids : [ids];

  if (cat_ids.length === 0) {
    return isMulti ? [] : undefined;
  }

  // 统一返回格式为 Map
  const resultMap = new Map();
  const missing = [];

  // 查缓存
  for (const id of cat_ids) {
    const cacheKey = `cat-avatar-${id}`;
    const cacheItem = getCacheItem(cacheKey);
    if (cacheItem) {
      resultMap.set(id, cacheItem);
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    // 先获取精选照片
    const bestMap = await getBestPhoto(missing);
    let latestMap = new Map();

    // 如需兜底，再仅对缺少精选的猫获取最新照片
    if (!options?.bestOnly) {
      const needLatest = missing.filter(id => !bestMap.has(id));
      if (needLatest.length > 0) {
        latestMap = await getLatestPhoto(needLatest);
      }
    }

    // 合并与签名
    for (const id of missing) {
      const photo = bestMap.get(id) || latestMap.get(id);
      if (photo) {
        const signed = await signPhotoUrls(photo);
        resultMap.set(id, signed);
        setCacheItem(`cat-avatar-${id}`, signed, cacheTime.catAvatar);
      } else {
        resultMap.set(id, undefined);
      }
    }
  }
  
  // 按输入格式返回
  if (isMulti) {
    return ids.map(id => resultMap.get(id));
  } else {
    return resultMap.get(ids);
  }
}

// 辅助函数：获取精选照片（支持多猫）
async function getBestPhoto(ids) {
  const isMulti = Array.isArray(ids);
  const cat_ids = isMulti ? ids : [ids];
  const photoMap = new Map();

  if (cat_ids.length === 0) {
    return isMulti ? photoMap : null;
  }

  const query = {
    cat_id: { $in: cat_ids },
    verified: true,
    best: true
  };

  const { result: photos } = await app.mpServerless.db.collection('photo').find(query);

  if (Array.isArray(photos)) {
    // 按 cat_id 对照片进行分组
    const photosByCat = new Map();
    for (const p of photos) {
      if (!photosByCat.has(p.cat_id)) {
        photosByCat.set(p.cat_id, []);
      }
      photosByCat.get(p.cat_id).push(p);
    }
    // 为每个 cat_id 随机选择一张照片
    for (const [cat_id, catPhotos] of photosByCat.entries()) {
      const randomIndex = randomInt(0, catPhotos.length - 1);
      photoMap.set(cat_id, catPhotos[randomIndex]);
    }
  }

  if (isMulti) {
    return photoMap;
  } else {
    return photoMap.get(ids) || null;
  }
}

// 辅助函数：获取最新照片（支持多猫）
async function getLatestPhoto(ids) {
  const isMulti = Array.isArray(ids);
  const cat_ids = isMulti ? ids : [ids];
  const photoMap = new Map();

  if (cat_ids.length === 0) {
    return isMulti ? photoMap : null;
  }
  
  const query = {
    cat_id: { $in: cat_ids },
    verified: true
  };

  const { result: photos } = await app.mpServerless.db.collection('photo').find(query, { sort: { mdate: -1 } });

  if (Array.isArray(photos)) {
    for (const p of photos) {
      // 有序遍历，首次出现即为该猫最新照片
      if (!photoMap.has(p.cat_id)) {
        photoMap.set(p.cat_id, p);
      }
    }
  }
  
  if (isMulti) {
    return photoMap;
  } else {
    return photoMap.get(ids) || null;
  }
}

// 仅签名头像必要字段
async function signPhotoUrls(photo) {
  if (!photo) return photo;
  try {
    const signedPhoto = { ...photo };
    const urlToSign = signedPhoto.photo_compressed || signedPhoto.photo_id;
    if (urlToSign) {
      const signedUrl = await signCosUrl(urlToSign);
      if (signedPhoto.photo_compressed) {
        signedPhoto.photo_compressed = signedUrl;
      } else {
        signedPhoto.photo_id = signedUrl;
      }
    }
    
    return signedPhoto;
  } catch (error) {
    console.error("签名照片URL失败:", error);
    return photo; // 返回原始照片
  }
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

export {
  getAvatar,
  getVisitedDate,
  setVisitedDate,
  getCatItem,
  getCatItemMulti,
  getAllCats,
  signPhotoUrls
}
