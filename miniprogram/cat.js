// 放置与cat对象有关的函数
const utils = require('./utils.js');

// 常用的一些对象
const db = wx.cloud.database();
const coll_photo = db.collection('photo');

// 获取猫猫的封面图
// TODO(zing): 可以搞个缓存
async function getAvatar(cat_id, total) {
  if (!total || total === 0) {
    return undefined;
  }
  
  const qf = {
    cat_id: cat_id,
    verified: true,
    best: true
  };

  // TODO: 这里对于API调用的次数较多，需要修改
  var index = utils.randomInt(0, total);
  var pho_src = (await coll_photo.where(qf).skip(index).limit(1).get()).data;
  return pho_src[0];
}

export {
  getAvatar
}