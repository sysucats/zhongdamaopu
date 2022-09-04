const getUser = require("./user.js").getUser;

const cloud = require('./cloudAccess.js').cloud;

// 常用的一些对象
const db = cloud.database();
const _ = db.command;
const coll_inter = db.collection('inter');
var user = undefined;
getUser().then((res) => {user = res;});

// 定义数据库常量：
const TYPE_LIKE = 10000;

// 请求点赞记录
async function like_get(item_id) {
  return (await coll_inter.where({type: TYPE_LIKE, uid: user.openid, item_id: item_id}).get()).data;
}

// 检查是否有点赞记录，item可以是photo、cat、comment
async function like_check(item_id) {
  var res = await like_get(item_id);
  // 后续可能会支持点赞取消，用count来表示点赞次数
  return res.length > 0 && res[0].count > 0;
}

// 点赞操作
async function like_add(item_id, item_type) {
  var res = await like_get(item_id);
  // 已经赞过
  if (res.length > 0 && res[0].count > 0) {
    return false;
  }
  
  // 已有记录，但是不是点赞的
  if (res.length > 0) {
    await cloud.callFunction({
      name: "curdOp",
      data: {
        operation: "update",
        collection: "inter",
        item_id: res[0]._id,
        data: {
          count: 1
        }
      }
    });
  } else {
    // 没有记录
    await cloud.callFunction({
      name: "curdOp",
      data: {
        operation: "add",
        collection: "inter",
        data: {
          type: TYPE_LIKE,
          uid: user.openid,
          item_id: item_id,
          count: 1
        }
      }
    });
  }

  // 加上去
  console.log("like", item_type, item_id);
  const result = await cloud.callFunction({
    name: "curdOp",
    data: {
      operation: "inc",
      type: "like",
      collection: item_type,
      item_id, item_id,
    }
  });

  return result.ok;
}

module.exports = {
  like_check,
  like_add,
}