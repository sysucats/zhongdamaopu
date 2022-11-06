import { getCacheItem, setCacheItem, cacheTime } from "./cache";
import { cloud } from "./cloudAccess"

function _commentCountKey(cat_id) {
  return `cat-comment-count-${cat_id}`;
}

// 使用openid来读取用户信息
async function getCatCommentCount(cat_id) {
  var cacheKey = _commentCountKey(cat_id);
  var cacheItem = getCacheItem(cacheKey);
  console.log("getCatCommentCount", cacheKey, cacheItem);
  if (cacheItem) {
    return cacheItem;
  }

  cacheItem = await _doGetCatCommentCount(cat_id);
  
  setCacheItem(cacheKey, cacheItem, cacheTime.commentCount);
  return cacheItem;
}

async function _doGetCatCommentCount(cat_id) {
  if (cat_id === undefined) {
    return 0;
  }
  const db = cloud.database();
  const _ = db.command;
  const coll_comment = db.collection('comment');
  return (await coll_comment.where({
    cat_id: cat_id, 
    deleted: _.neq(true)
  }).count()).total;
}

module.exports = {
  getCatCommentCount,
}