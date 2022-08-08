const getUser = require("./user.js").getUser;

const config = require('./config.js');
const use_wx_cloud = config.use_wx_cloud; // 是否使用微信云，不然使用Laf云
const cloud = use_wx_cloud ? wx.cloud : require('./cloudAccess.js').cloud;

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
  return await (await coll_inter.where({type: TYPE_LIKE, uid: user.openid, item_id: item_id}).get()).data;
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
    if(use_wx_cloud){ // 微信云
      await coll_inter.doc(res[0]._id).update({
        data: {
          count: 1,
        }
      });
    }
    else{ // Laf云
      await cloud.invokeFunction("interOp", {
        type: "interRecordUpdate",
        record_id: res[0]._id
      });
    }
  } else {
    // 没有记录
    if(use_wx_cloud){ // 微信云
      await coll_inter.add({
        data: {
          type: TYPE_LIKE,
          uid: user.openid,
          item_id: item_id,
          count: 1
        }
      });
    }
    else{
      await cloud.invokeFunction("interOp", {
        type: "interRecordAdd",
        record_item: {
          type: TYPE_LIKE,
          uid: user.openid,
          item_id: item_id,
          count: 1
        }
      });
    }
  }

  // 加上去
  console.log("like", item_type, item_id);
  if(use_wx_cloud){
    await cloud.callFunction({
      name: "interOp",
      data: {
        type: "like_add",
        item_type: item_type,
        item_id, item_id,
      }
    });
  }
  else{
    await cloud.invokeFunction("interOp", {
      type: "likeAdd",
      item_type: item_type,
      item_id, item_id,
    });
  }
  return true;
}

module.exports = {
  like_check,
  like_add,
}