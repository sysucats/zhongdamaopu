// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
const _ = db.command;

// 权限检查
async function check_manager(level) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: level } }));
  return isManager;
}

// 修改
async function modify(item_id, data) {
  return await db.collection("news").doc(item_id).update({
    data: data
  });
}

// 删除
async function doDelete(item_id) {
  var item = (await db.collection("news").doc(item_id));
  console.log(item);
  // 删除云储存的图片
  if (item.photos_path && item.photos_path.length > 0) {
      wx.cloud.deleteFile({
          fileList: item.photos_path,
          success() {
              console.log("成功删除云储存图片");
          },
          fail() {
              console.log("图片删除失败", item.photos_path);
          },
      });
  }
  if (item.cover_path && item.cover_path.length > 0) {
      wx.cloud.deleteFile({
          fileList: [item.cover_path],
          success() {
              console.log("成功删除云储存封面");
          },
          fail() {
              console.log("封面删除失败:", item.cover_path);
          },
      });
  }

  // 删除公告在数据库中的记录
  await db.collection('news').doc(item_id).remove({
    success: res => {
      return true;
    },
    fail: err => {
      return false;
    }
})
}

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  const type = event.type;

  // 修改
  if (type == "modify") {
    if (!check_manager(3)) {
      throw `not a manager.`;
    }
    const item_id = event.item_id;
    const item_data = event.item_data;
    return modify(item_id, item_data);
  }

  // 删除
  if (type == "delete") {
    if (!check_manager(3)) {
      throw `not a manager.`;
    }
    const item_id = event.item_id;
    return doDelete(item_id);
  }

  throw `unk type ${type}`;
}