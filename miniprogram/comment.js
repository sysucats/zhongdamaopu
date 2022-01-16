
// 使用openid来读取用户信息
async function getCatCommentCount(cat_id) {
  if (cat_id === undefined) {
    return 0;
  }
  const db = wx.cloud.database();
  const coll_comment = db.collection('comment');
  return (await coll_comment.where({cat_id: cat_id}).count()).total;
}

module.exports = {
  getCatCommentCount,
} 