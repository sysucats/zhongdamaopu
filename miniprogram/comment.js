const config = require('./config.js');
const use_wx_cloud = config.use_wx_cloud; // 是否使用微信云，不然使用Laf云
const cloud = use_wx_cloud ? wx.cloud : require('./cloudAccess.js').cloud;

// 使用openid来读取用户信息
async function getCatCommentCount(cat_id) {
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