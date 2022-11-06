

import cloud from '@/cloud-sdk';
import axios from 'axios';
const db = cloud.database();
const _ = db.command;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx;
  const openid = auth.openid;

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const type = body.type;

  const is_manager = await check_manager(3, openid);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  // 创建
  if (type == "create") {
    const item_data = body.item_data;
    return create(item_data);
  }

  // 修改
  if (type == "modify") {
    const item_id = body.item_id;
    const item_data = body.item_data;
    return modify(item_id, item_data);
  }

  // 删除
  if (type == "delete") {
    const item_id = body.item_id;
    return doDelete(item_id);
  }

  throw `unk type ${type}`;
}

// 权限检查
async function check_manager(level, openid) {  
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

// 创建
async function create(data) {
  return await db.collection('news').add(data);
}

// 修改
async function modify(item_id, data) {
  return await db.collection("news").doc(item_id).update(data);
}

// 删除
async function doDelete(item_id) {
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
  
  // 删除公告在数据库中的记录
  return await db.collection('news').doc(item_id).remove();
}

