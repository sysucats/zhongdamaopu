import { getCacheItem, setCacheItem, cacheTime } from "./cache";

function _commentCountKey(cat_id) {
  return `cat-comment-count-${cat_id}`;
}

// 获取猫的便利贴数量
async function getCatCommentCount(cat_id, options) {
  var cacheKey = _commentCountKey(cat_id);
  var cacheItem = getCacheItem(cacheKey, options);
  console.log("getCatCommentCount", cacheKey, cacheItem);
  if (cacheItem) {
    return cacheItem;
  }

  cacheItem = await _doGetCatCommentCount(cat_id);
  setCacheItem(cacheKey, cacheItem, cacheTime.commentCount);
  return cacheItem;
}

async function _doGetCatCommentCount(cat_id) {
  const app = getApp();
  if (cat_id === undefined) {
    return 0;
  }
  // EMAS 客户端查询不认 $exists，拉回后在客户端排除照片评论
  const { result } = await app.mpServerless.db.collection('comment').find(
    { cat_id: cat_id, deleted: { $ne: true } },
    { projection: { photo_id: 1 }, limit: 1000 }
  );
  return (result || []).filter(c => !c.photo_id).length;
}

module.exports = {
  getCatCommentCount,
}