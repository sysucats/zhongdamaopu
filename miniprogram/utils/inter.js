import { getUser, setUserRole } from "./user";
import { getCacheItem, setCacheItem, cacheTime } from "./cache";
import api from "./cloudApi";
const app = getApp();

var user = undefined;

async function ensureUser() {
  if (user) {
    return;
  }
  user = await getUser();
  return;
}

// 定义数据库常量：
const TYPE_LIKE = 10000;    // 点赞
const TYPE_CAT_LOCATION = 20000; // 猫咪位置记录（轨迹点）

// 获取缓存key
function _getLikeCacheKey(item_id) {
  return `like-item-${item_id}`;
}

// 批量请求点赞记录，每个用户只能对每个item点赞一次，所以这里用Get判断是合适的
async function _likeGet(item_ids) {
  if (!item_ids) {
    return [];
  }
  await ensureUser();
  const { result } = await app.mpServerless.db.collection('inter').find({ type: TYPE_LIKE, uid: user.openid, item_id: { $in: item_ids } });
  return result;
}

// 批量检查是否有点赞记录，item可以是photo、cat、comment
async function likeCheck(item_ids, options) {
  if (!item_ids) {
    return undefined;
  }

  var found = {};
  var not_found = [];

  for (var item_id of item_ids) {
    var cacheKey = _getLikeCacheKey(item_id);
    var cacheItem = getCacheItem(cacheKey, options);
    if (cacheItem) {
      found[item_id] = cacheItem;
      continue;
    }
    not_found.push(item_id);
  }

  var res = await _likeGet(not_found);
  for (var x of res) {
    var cacheKey = _getLikeCacheKey(x.item_id);
    setCacheItem(cacheKey, x, cacheTime.likeItem);
    found[x.item_id] = x.count > 0;
  }
  // 后续可能会支持点赞取消，用count来表示点赞次数
  return item_ids.map(x => Boolean(found[x]));
}


// 点赞成为特邀
async function likeToInvite() {
  if (user.role) {
    // 已经是了
    console.log("already role");
    return;
  }

  const { result: count } = await app.mpServerless.db.collection('inter').count({ type: TYPE_LIKE, uid: user.openid });

  if (count >= 2) {
    console.log("invite user with like_count >= 2");
    await setUserRole(user.openid, 1);
    await getUser({ nocache: true });
  }
}


// 点赞操作
async function likeAdd(item_id, item_type) {
  var res = (await likeCheck([item_id]))[0];
  console.log(res);
  // 已经赞过
  if (res) {
    return false;
  }

  // 没有记录
  await ensureUser();
  await api.curdOp({
    operation: "add",
    collection: "inter",
    data: {
      type: TYPE_LIKE,
      uid: user.openid,
      item_id: item_id,
      count: 1
    }
  });

  // 加上去
  console.log("like", item_type, item_id);
  await api.curdOp({
    operation: "inc",
    collection: item_type,
    type: "like",
    item_id, item_id,
  });

  // 刷新缓存
  await likeCheck([item_id], {
    nocache: true
  });

  // 特邀用户
  likeToInvite();
  return true;
}

// 写入猫咪位置记录到 inter 表
// 去重规则：
//   1. 与数据库中该猫的最新一条记录比较（时间最近的那条）
//   2. 与批内上一次写入的坐标比较（通过 prevCoord 参数传入）
//   两处之一坐标相同即跳过写入；不同经纬度的正常保留
// 参数 prevCoord: { latitude, longitude } —— 调用方维护的批内前一条坐标，可不传
async function addCatLocation(cat_id, latitude, longitude, userOpenid, prevCoord) {
  if (!cat_id || !latitude || !longitude) return;

  // 先与批内上一条坐标比（避免同批内重复，不必查库）
  if (prevCoord && prevCoord.latitude === latitude && prevCoord.longitude === longitude) {
    console.log('cat location duplicate (in-batch), skip', cat_id, latitude, longitude);
    return false;
  }

  // 再查数据库中该猫的最新一条记录
  const { result: latestList } = await app.mpServerless.db.collection('inter').find({
    type: TYPE_CAT_LOCATION,
    item_id: cat_id,
  }, {
    sort: { location_time: -1 },
    limit: 1,
  });

  // 与数据库最新一条坐标比
  if (latestList && latestList.length > 0) {
    const latest = latestList[0];
    if (latest.latitude === latitude && latest.longitude === longitude) {
      console.log('cat location duplicate (db latest), skip', cat_id, latitude, longitude);
      return false;
    }
  }

  const now = new Date().toISOString();

  await api.curdOp({
    operation: "add",
    collection: "inter",
    data: {
      type: TYPE_CAT_LOCATION,
      uid: userOpenid,
      _openid: userOpenid,
      count: 1,
      item_id: cat_id,
      latitude,
      longitude,
      location_time: now
    }
  });
  return true;
}

module.exports = {
  likeCheck,
  likeAdd,
  TYPE_CAT_LOCATION,
  addCatLocation,
}