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
const TYPE_LIKE = 10000;

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

module.exports = {
  likeCheck,
  likeAdd,
}