// curdOp 数据库操作云函数

import cloud from '@/cloud-sdk'

const db = cloud.database();

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx;

  const openid = auth.openid;  // 用户的 OpenID
  const permissionLevel = body.permissionLevel;  // 操作要求的最低权限
  const operation = body.operation;  // DB 操作 ["add", "update", "remove", "set", "inc"]
  
  console.log("curdOp param:", body);

  // 检查权限
  if (permissionLevel) {
    const permission = await check_permission(openid, permissionLevel);
    if (!permission) {
      return { errMsg: 'not a manager', ok: false };
    }
  }

  // 数据库操作
  const collection = body.collection;
  const item_id = body.item_id;
  var data = body.data;

  if (operation == "add") {  // 添加记录
    // Laf云不会主动存储 _openid ，但是微信云（在前端直接往数据库增加记录时）会
    // 前端可能需要跟据 _openid 字段进行数据库搜索，故手动保存
    if (collection == "comment" || collection == "feedback" || collection == "inter" ||
    collection == "news" || collection == "photo" ) {
      data._openid = openid; 
    }
    return await db.collection(collection).add(data);
  }
  else if (operation == "update") {  // 更新记录
    return await db.collection(collection).doc(item_id).update(data);
  }
  else if (operation == "remove") {  // 移除记录
    if (collection == "news") {  // 删除公告关联的图片和封面
      await delete_photo_for_news(item_id);
    }
    return await db.collection(collection).doc(item_id).remove();
  }
  else if (operation == "set") {  // 创建记录
    return await db.collection(collection).doc(item_id).set(data);
  }
  else if (operation == "inc") {  // +1 操作
    const type = body.type;  // 下策
    const _ = db.command;
    if (type == "pop") {
      return await db.collection(collection).doc(item_id).update( { popularity: _.inc(1) } );
    }
    else if (type == "like") {
      return await db.collection(collection).doc(item_id).update( { like_count: _.inc(1) } );
    }
    else {
      return { errMsg: `unk type ${type}`, ok: false };
    }
  }
  else {
    return { errMsg: `unk operation ${operation}`, ok: false };
  }
}

// 权限检查
async function check_permission(openid, level) {
  console.log(`Check premission for ${openid} with level ${level}`);
  const isManager = await cloud.invoke('isManager', {
    auth: {
      openid: openid,
    },
    body: {
      req: level
    }
  });
  return isManager;
}

// 删除图片
async function delete_photo_for_news(item_id) {
  db.collection('news').doc(item_id).get().then(res => {
    var item = res.data;
    // 删除云储存的图片
    console.log("Photo path:", item.photosPath);
    console.log("Cover path:", item.coverPath);
    if (item.photosPath && item.photosPath.length > 0) {
      cloud.invoke("deleteFiles", {
        body: {
          fileIDs: item.photosPath
        }
      }).then(res => {
        console.log("删除公告图片", item.photosPath);
      });
    }
    if (item.coverPath) {
      cloud.invoke("deleteFiles", {
        body: {
          fileIDs: [item.coverPath],
        }
      }).then(res => {
        console.log("删除公告封面", item.coverPath);
      });
    }
  }); 
}
