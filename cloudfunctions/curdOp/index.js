// curdOp 数据库操作云函数
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})
const db = cloud.database();

exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || event.openid;
  const permissionLevel = event.permissionLevel;  // 操作要求的最低权限
  const operation = event.operation;  // DB 操作 ["add", "update", "remove", "set", "inc"]
  
  console.log("curdOp param:", event);

  // 检查权限
  // Not (A and B) = (Not A) or (Not B)
  if(operation != "add" || collection != "news") {
    // 添加论坛新帖子跳过权限检查
    if (permissionLevel) {
      const permission = await check_permission(openid, permissionLevel);
      if (!permission) {
        return { errMsg: 'not a manager', ok: false };
      }
    }
  }

  // 数据库操作
  const collection = event.collection;
  const item_id = event.item_id;
  var data = {
    data: event.data
  };

  if (operation == "add") {  // 添加记录
    if (collection == "comment" || collection == "feedback" || collection == "inter" ||
    collection == "news" || collection == "photo" ) {
      data.data._openid = openid; 
    }
    return await db.collection(collection).add(data);
  }
  else if (operation == "update") {  // 更新记录
    console.log(`update item_id: ${item_id}, data: `, data);
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
    const type = event.type;  // 下策
    const _ = db.command;
    if (type == "pop") {
      return await db.collection(collection).doc(item_id).update( { data: {popularity: _.inc(1)} } );
    }
    else if (type == "like") {
      return await db.collection(collection).doc(item_id).update( { data: {like_count: _.inc(1)} } );
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
  const isManager = await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: level } });
  return isManager;
}

// 删除图片
async function delete_photo_for_news(item_id) {
  var item = (await db.collection('news').doc(item_id).get()).data;
  // 删除云储存的图片
  console.log("Photo path:", item.photosPath);
  console.log("Cover path:", item.coverPath);
  if (item.photosPath && item.photosPath.length > 0) {
    await cloud.deleteFile({
      fileList: item.photosPath,
    });
    console.log("删除公告图片", item.photosPath);
  }
  if (item.coverPath) {
    await cloud.deleteFile({
      fileList: [item.coverPath],
    });
    console.log("删除公告封面", item.coverPath);
  }
}
