// curdOp 数据库操作云函数
import cloud from '@lafjs/cloud'
const db = cloud.database();

// 操作对应collection需要的等级
const permissionNeed = {
  "add": {
    "app_secret": 99,
    "cat": 2,
    "comment": 0,
    "feedback": 0,
    "inter": 0,
    "news": 3,
    "photo": 0,
    "photo_rank": 3,
    "reward": 3,
    "science": 3,
    "setting": 3,
    "user": 0,
  },
  "update": {
    "app_secret": 99,
    "cat": 2,
    "comment": 1,
    "feedback": 1,
    "inter": 1,
    "news": 1,
    "photo": 1,
    "photo_rank": 1,
    "reward": 1,
    "science": 1,
    "setting": 99,
    "user": 1,
  },
  "remove": {
    "app_secret": 99,
    "cat": 99,
    "comment": 1,
    "feedback": 1,
    "inter": 1,
    "news": 1,
    "photo": 1,
    "photo_rank": 1,
    "reward": 99,
    "science": 99,
    "setting": 99,
    "user": 1,
  },
  "set": {
    "app_secret": 99,
    "cat": 2,
    "comment": 1,
    "feedback": 1,
    "inter": 1,
    "news": 1,
    "photo": 1,
    "photo_rank": 1,
    "reward": 1,
    "science": 1,
    "setting": 1,
    "user": 1,
  },
  "inc": {
    "app_secret": 99,
    "cat": 0,
    "comment": 1,
    "feedback": 1,
    "inter": 1,
    "news": 1,
    "photo": 0,
    "photo_rank": 1,
    "reward": 1,
    "science": 1,
    "setting": 99,
    "user": 1,
  },
}

// 允许创建者操作（user.openid == doc._openid）
const permissionAuthor = {
  "add": {},
  "update": {
    "feedback": true
  },
  "remove": {},
  "set": {},
  "inc": {},
}

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  // console.log("ctx:", ctx);
  const { body, query } = ctx;

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  var openid = ctx.user.openid;  // 用户的 OpenID

  const collection = body.collection;
  const operation = body.operation;  // DB 操作 ["add", "update", "remove", "set", "inc"]
  const permissionLevel = permissionNeed[operation][collection];  // 操作要求的最低权限
  console.log("permissionLevel:", permissionLevel)
  
  console.log("curdOp param:", body);
  // TODO, 不要login了
  if (!openid) {
    openid = (await cloud.invoke("login", { body: { wx_code: body.wx_code } })).openid;
    if (!openid) {
      return;
    }
  }

  // 数据库操作
  const item_id = body.item_id;
  var data = body.data;

  // 检查权限
  if (permissionLevel) {
    const allowAuthor = permissionAuthor[operation][collection];
    const permission = await check_permission(collection, item_id, openid, permissionLevel, allowAuthor);
    if (!permission) {
      return { errMsg: 'not a manager', ok: false };
    }
  }


  if (operation == "add") {  // 添加记录
    // Laf云不会主动存储 _openid ，但是微信云（在前端直接往数据库增加记录时）会
    // 前端可能需要跟据 _openid 字段进行数据库搜索，故手动保存
    if (openid) {
      data._openid = openid;
    }
    data.create_date = new Date();
    data.mdate = new Date();
    return await db.collection(collection).add(data);
  }
  else if (operation == "update") {  // 更新记录
    data.mdate = new Date();
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
async function check_permission(collection, item_id, openid, level, allowAuthor) {
  console.log(`Check premission for ${openid} with level ${level}, allowAuthor: ${allowAuthor}.`);
  // 是否满足管理员等级
  const isManager = await cloud.invoke('isManager', {
    user: {
      openid: openid,
    },
    body: {
      req: level
    }
  });
  if (isManager) {
    return true
  }

  // 是否允许创建者修改
  var res = false;
  if (allowAuthor) {
    const item = (await db.collection(collection).doc(item_id).get()).data;
    return item._openid === openid;
  }
  return res;
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
